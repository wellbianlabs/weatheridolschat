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

  // Stream the body straight through. No buffering — keeps memory flat
  // for long tracks and lets the user's download start immediately.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Suno URLs are signed/short-lived, so caching here is risky.
      'Cache-Control': 'no-store',
    },
  });
}
