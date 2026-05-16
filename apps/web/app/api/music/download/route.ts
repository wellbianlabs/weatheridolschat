import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Audio download proxy.
 *
 *   GET /api/music/download?url=<audioUrl>&name=<filename>
 *
 * Suno's audio URLs point at AWS S3 buckets on a different origin. The
 * HTML `<a download="...">` attribute is honored only for same-origin
 * targets, so without a proxy the user's browser would download the
 * file with the S3-generated filename (or just open it inline,
 * depending on Content-Disposition). Streaming the response through
 * here lets us set a clean filename like `sunny-weather-song.mp3` and
 * force `Content-Disposition: attachment`.
 *
 * Security: we only proxy URLs whose host is on a small allowlist of
 * known Suno-compatible audio hosts so this can't be used as an open
 * URL forwarder.
 */
const ALLOWED_AUDIO_HOSTS = [
  'sunoapi.org',
  'cdn1.suno.ai',
  'cdn2.suno.ai',
  'audiopipe.suno.ai',
  'suno-images.s3.amazonaws.com',
  // sunoapi.org typically returns AWS S3 storage URLs. The patterns vary.
  '.amazonaws.com',
  '.r2.cloudflarestorage.com',
  '.cloudfront.net',
  // Mock adapter sample track — keeps mock-mode review UX identical
  // to live (download button works for the placeholder MP3 too).
  'www.learningcontainer.com',
];

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_AUDIO_HOSTS.some((pat) =>
    pat.startsWith('.') ? hostname.endsWith(pat) : hostname === pat,
  );
}

function sanitizeFilename(name: string): string {
  // Keep ASCII letters/digits/dash/underscore/dot. Replace everything
  // else with `_` so we never write a Content-Disposition with quotes,
  // semicolons, or path traversal in it.
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'weather-song.mp3';
}

/**
 * Decide whether an upstream response is MP3 audio. We're strict on
 * purpose — the route's contract is "MP3 only", so we never want to
 * serve a `.mp3`-named file whose body is actually FLAC/WAV/OGG/etc.
 *
 * Order of evidence:
 *   1. Trust an explicit `audio/mpeg` (or legacy `audio/mp3`) header.
 *   2. Reject any *other* explicit `audio/*` content-type.
 *   3. Fall back to the URL path: if it ends in `.mp3` we trust it
 *      (some CDNs serve octet-stream for short-lived signed URLs).
 *   4. Magic-byte sniff handled by the caller for the ambiguous case.
 */
function classifyAudio(contentType: string | null, urlPath: string): 'mp3' | 'other' | 'unknown' {
  const ct = (contentType ?? '').toLowerCase().split(';')[0]!.trim();
  if (ct === 'audio/mpeg' || ct === 'audio/mp3') return 'mp3';
  if (ct.startsWith('audio/')) return 'other';
  if (urlPath.toLowerCase().endsWith('.mp3')) return 'mp3';
  return 'unknown';
}

/**
 * MP3 magic-byte check on the first 10 bytes of the stream.
 * Valid MP3 files start with either:
 *   - "ID3" (0x49 0x44 0x33) — ID3v2 tag header, present on most files
 *   - 0xFF 0xFB / 0xFA / 0xF3 / 0xF2 — MPEG frame sync (no tag)
 */
function isMp3Magic(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  if (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1]! & 0xe0) === 0xe0) return true;
  return false;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const audio = url.searchParams.get('url');
  const rawName = url.searchParams.get('name') ?? 'weather-song.mp3';
  if (!audio) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Missing url' } },
      { status: 400 },
    );
  }

  let target: URL;
  try {
    target = new URL(audio);
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid url' } },
      { status: 400 },
    );
  }
  if (!isAllowedHost(target.hostname)) {
    console.warn(`[music-download] blocked host=${target.hostname}`);
    return NextResponse.json(
      { error: { code: 'forbidden_host', message: `Host ${target.hostname} not allowed` } },
      { status: 403 },
    );
  }

  const filename = sanitizeFilename(rawName.endsWith('.mp3') ? rawName : `${rawName}.mp3`);
  console.info(`[music-download] proxy host=${target.hostname} filename=${filename}`);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      // Suno's CDNs don't need any specific headers, but a UA helps.
      headers: { 'User-Agent': 'wi-weather-idols/1.0' },
    });
  } catch (err) {
    console.error(`[music-download] upstream fail: ${(err as Error).message}`);
    return NextResponse.json(
      { error: { code: 'upstream_error', message: (err as Error).message } },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: { code: 'upstream_error', message: `Upstream HTTP ${upstream.status}` } },
      { status: 502 },
    );
  }

  // ── MP3-only enforcement ──────────────────────────────────────────
  // Contract: this route serves MP3, period. If upstream sends another
  // codec we refuse rather than mislabel a .mp3 with WAV/FLAC bytes.
  const upstreamCt = upstream.headers.get('content-type');
  const verdict = classifyAudio(upstreamCt, target.pathname);
  if (verdict === 'other') {
    console.warn(
      `[music-download] non-mp3 content-type=${upstreamCt} host=${target.hostname}`,
    );
    return NextResponse.json(
      {
        error: {
          code: 'unsupported_format',
          message: `Source is not MP3 (got ${upstreamCt ?? 'unknown'}). MP3 다운로드만 지원합니다.`,
        },
      },
      { status: 415 },
    );
  }

  // If neither header nor URL extension confirms MP3, sniff the first
  // 10 bytes for ID3 / MPEG frame sync. Buffer + re-stream the body so
  // we don't lose those bytes when piping to the client.
  let bodyStream: ReadableStream<Uint8Array> = upstream.body;
  if (verdict === 'unknown') {
    const reader = upstream.body.getReader();
    const { value: head } = await reader.read();
    const headBytes = head ?? new Uint8Array(0);
    if (!isMp3Magic(headBytes)) {
      console.warn(
        `[music-download] magic-byte sniff failed first10=${Array.from(headBytes.slice(0, 10))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ')} host=${target.hostname}`,
      );
      void reader.cancel();
      return NextResponse.json(
        {
          error: {
            code: 'unsupported_format',
            message: 'Source content is not MP3. MP3 다운로드만 지원합니다.',
          },
        },
        { status: 415 },
      );
    }
    // Re-stream: emit the sniffed head bytes first, then forward the rest.
    bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(headBytes);
      },
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) controller.close();
        else if (value) controller.enqueue(value);
      },
      cancel() {
        void reader.cancel();
      },
    });
  }

  // Always claim audio/mpeg + .mp3 — at this point we've confirmed MP3
  // by header, extension, or magic bytes.
  return new Response(bodyStream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Suno URLs are signed/short-lived, so caching here is risky.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
