'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Character } from '@wi/core/characters';
import type { ProductPayload } from '@wi/core/chat';
import { kstDateString } from '@wi/core/time';
import type { WeatherSnapshot } from '@wi/core/weather';
import { Button, Chip, Eyebrow } from '@wi/ui/web';

import WeatherBackground from '@/components/WeatherBackground';
import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Minimal subset of the Web Speech API surface we use. The actual
 * types live in `lib.dom.d.ts` but vary between Chrome's prefixed
 * variant (`webkitSpeechRecognition`) and the standard one — we type
 * just the bits we touch so we don't have to fight TS over vendor
 * differences.
 */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal?: boolean;
    0: { transcript: string };
  }>;
}

type MessageKind = 'text' | 'image' | 'product' | 'music';
interface MusicTrack {
  taskId: string;
  title?: string;
  audioUrl?: string;
  lyrics?: string;
  /**
   * Full lifecycle of a weather song:
   *
   *   writing_lyrics → queued → streaming → done
   *                                       ↘
   *                                          failed (from anywhere)
   *
   * `writing_lyrics` is OUR step (Gemini) — happens before the song
   * even reaches Suno. The remaining states track Suno's pipeline.
   */
  status: 'writing_lyrics' | 'queued' | 'streaming' | 'done' | 'failed';
  error?: string;
  /** Epoch ms when the task started (chip click). Drives the progress
   *  bar — neither Gemini nor Suno expose a real percentage. */
  startedAt?: number;
  /** Number of GET /api/music poll attempts so far. Helps the user tell
   *  "actively working" from "stuck waiting". */
  pollCount?: number;
  /** True while the polling loop is still active. Lets the card show a
   *  cancel button only when cancellation is meaningful. */
  active?: boolean;
}
interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: MessageKind;
  content?: string;
  imageUrl?: string;
  product?: ProductPayload;
  music?: MusicTrack;
  pending?: boolean;
  /** Object URL of a Google TTS-rendered MP3, cached on first 🔊 click.
   *  Reused for replay + download so we don't re-bill the API. */
  ttsUrl?: string;
  /** True while /api/tts is in flight for this message. */
  ttsLoading?: boolean;
  /** Last TTS error text, if any. */
  ttsError?: string;
}

/**
 * Per-day message cap. `Infinity` = no limit (current behavior). The
 * counter + paywall UI is kept wired up so we can re-enable a quota
 * (e.g. 30) for monetisation later by flipping this single number.
 */
const MAX_FREE_MESSAGES = Number.POSITIVE_INFINITY;

const WEATHER_LABEL: Record<string, string> = {
  clear: '맑음',
  clouds: '흐림',
  rain: '비',
  drizzle: '이슬비',
  thunder: '천둥',
  snow: '눈',
  mist: '안개',
};

const SHORTCUTS = [
  { id: 'selfie', label: '셀카 한 장', text: '오늘 셀카 보여줘!' },
  // The 날씨송 shortcut is intentionally placed second and uses a music
  // emoji so it reads as a distinct "feature" rather than just a question.
  // When tapped, the server-side intent classifier picks up "노래/만들어"
  // and emits request_song → the client kicks off /api/music + polls.
  { id: 'weather-song', label: '🎵 날씨송 만들기', text: '오늘 날씨에 어울리는 노래 만들어줘' },
  { id: 'recommend', label: '추천해줘', text: '오늘 뭐 추천해줄래?' },
];

function storageKey(characterId: string) {
  return `wi.chat.${characterId}`;
}
function truncate(s: string | undefined, n: number): string {
  if (!s) return 'unknown';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/**
 * Belt-and-suspenders cleanup for assistant text.
 *
 * The character system prompts explicitly tell the LLM never to emit
 * markdown image syntax, HTML img tags, or placeholder URLs in its
 * response — the system attaches the real asset (selfie / song)
 * separately as its own bubble. But LLMs occasionally regress and
 * hallucinate something like:
 *
 *   잠깐, 찍어볼게 ☀️
 *   ---
 *   ![레인 셀카](https://i.imgur.com/placeholder.jpg)
 *   ---
 *   …어때, 머리 좀 헝클어졌나?
 *
 * Same idea for Japanese script — Rain's persona is from Kanazawa,
 * but the product rule is "Korean only in chat" (see rain.ts 언어
 * 규칙 block). The prompt is the primary defense; we still strip
 * any stray hiragana/katakana here so a one-off regression doesn't
 * surface a Japanese word in front of the user. Hangul + ASCII +
 * emoji + punctuation are preserved as-is.
 *
 * This sanitiser strips that noise so users never see a broken
 * image placeholder inside the bubble. Server-side prompt rules are
 * still the primary defense; this is the safety net.
 */
function sanitizeAssistantText(s: string | undefined): string {
  if (!s) return '';
  return (
    s
      // Markdown image syntax: ![alt](url)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // HTML img tags
      .replace(/<img\b[^>]*>/gi, '')
      // Markdown horizontal rules on their own lines (used as visual
      // dividers around fake images)
      .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '')
      // Bare placeholder image URLs the model invents
      .replace(/https?:\/\/[^\s)]*(?:placeholder|example\.com|imgur\.com\/placeholder)\S*/gi, '')
      // Japanese hiragana (U+3040–U+309F) + katakana (U+30A0–U+30FF) +
      // half-width katakana (U+FF65–U+FF9F). Kanji is intentionally NOT
      // included — the CJK Unified Ideographs block overlaps with the
      // Hanja rarely used in Korean, and stripping it risks damaging
      // legitimate Korean text. Hiragana/katakana are unambiguously
      // Japanese and safe to remove.
      .replace(/[぀-ゟ゠-ヿ･-ﾟ]+/g, '')
      // Strip empty parenthetical groups left over after hiragana
      // removal — e.g. "폭신하게 ()" or "(폭신하게)" with the JP
      // original deleted becomes "()" or "( )". Match Latin + fullwidth
      // parens. The space-or-empty inside `()` covers both cases.
      .replace(/\(\s*\)|（\s*）/g, '')
      // Collapse 3+ consecutive blank lines down to a single blank.
      .replace(/\n{3,}/g, '\n\n')
      // Collapse the double-spaces left behind by the strips above.
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

/**
 * Read the X-Quota-* headers an API route may have attached and feed
 * the parsed values into the chat client's quota state. Header
 * convention (see lib/quota.ts):
 *   X-Quota-Field     messages | selfies | songs | tts_chars | vision
 *   X-Quota-Limit     integer or "inf"
 *   X-Quota-Used      integer or "inf"
 *   X-Quota-Remaining integer or "inf"
 * Only updates state when the field is "messages" — that's the one
 * the AccountChip displays. Other fields are still emitted by their
 * routes for future tooltips / paywall trigger logic.
 */
function applyQuotaHeaders(
  headers: Headers,
  setQuota: (q: { used: number; limit: number | null } | null) => void,
): void {
  const field = headers.get('X-Quota-Field');
  if (field !== 'messages') return; // only the messages chip is exposed for now
  const usedRaw = headers.get('X-Quota-Used');
  const limitRaw = headers.get('X-Quota-Limit');
  if (usedRaw === null) return;
  const used = usedRaw === 'inf' ? 0 : Number.parseInt(usedRaw, 10) || 0;
  const limit = limitRaw === 'inf' || !limitRaw ? null : Number.parseInt(limitRaw, 10) || null;
  setQuota({ used, limit });
}

/**
 * Downscale + recompress an image File to a JPEG data URL that fits
 * comfortably under the server's 6MB upload cap. Maintains aspect
 * ratio; max dimension `maxEdge`; output quality `quality` (0..1).
 */
async function downscaleImageToDataUrl(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('FileReader fail'));
      reader.readAsDataURL(blob);
    });
  }
  return (canvas as HTMLCanvasElement).toDataURL('image/jpeg', quality);
}
function getTodayCount(): number {
  if (typeof window === 'undefined') return 0;
  // KST date — the daily quota rolls at 00:00 한국 time, not browser-local
  // midnight, so a user on a US trip doesn't get a surprise quota reset
  // when their laptop crosses local midnight.
  const today = kstDateString();
  const day = localStorage.getItem('wi.usage.day');
  if (day !== today) {
    localStorage.setItem('wi.usage.day', today);
    localStorage.setItem('wi.usage.messagesToday', '0');
    return 0;
  }
  return Number.parseInt(localStorage.getItem('wi.usage.messagesToday') ?? '0', 10);
}
function bumpTodayCount(): number {
  const n = getTodayCount() + 1;
  localStorage.setItem('wi.usage.messagesToday', String(n));
  return n;
}
function loadHistory(characterId: string): UIMessage[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UIMessage[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function saveHistory(characterId: string, messages: UIMessage[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(characterId), JSON.stringify(messages.slice(-50)));
}

export default function ChatClient({ character }: { character: Character }) {
  const [nickname, setNickname] = useState<string>('친구');
  const [messages, setMessages] = useState<UIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      kind: 'text',
      content: `안녕, 나는 ${character.displayName}이야. 첫인사 보내봐.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // Signed-in account snapshot. Phase 1 just shows the email/admin
  // badge in the header; Phase 2 layers server quota on top.
  const [account, setAccount] = useState<{ email: string | null; isAdmin: boolean } | null>(
    null,
  );
  // Server-reported quota for the messages field. Pulled from
  // X-Quota-* headers on every /api/chat response — Phase 2 makes
  // these numbers authoritative (replaces the localStorage soft
  // counter). null = no data yet (e.g. before first send), limit
  // = null when admin/unlimited.
  const [quota, setQuota] = useState<{ used: number; limit: number | null } | null>(null);
  // Pending image to send with the next message (from camera/file picker).
  // Held as a data URL so we can both preview it locally and ship it
  // through /api/chat without any extra encoding step.
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  // Web Speech API recognition state — see startListening / stopListening.
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [usage, setUsage] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);

  // Paywall trigger — set whenever a 429 (rate_limit) bounces back
  // from one of the quota-gated routes. Shape declared at module
  // scope (see PaywallReason interface below) so the standalone
  // PaywallModal component can share the same type.
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  // Per-song AbortControllers so the "취소" button on the music card can
  // stop the polling loop without affecting other in-flight songs.
  const songAbortersRef = useRef<Record<string, AbortController>>({});
  // Composer input ref — drives the "input always focused" behavior.
  // Real chat apps (Slack, Discord, ChatGPT) keep the cursor in the
  // composer at all times so the user can immediately start the next
  // message instead of having to click back into the field after
  // every send.
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNickname(localStorage.getItem('wi.nickname') ?? '친구');
    const prior = loadHistory(character.id);
    if (prior && prior.length > 0) setMessages(prior);
    setUsage(getTodayCount());
  }, [character.id]);

  // Load + subscribe to Supabase auth state. The admin email is
  // hard-coded in lib/supabase/identity.ts; the client UI keeps a
  // sync'd copy here so the header chip can show "admin" / email /
  // "로그인" instantly without a server round-trip.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let alive = true;
    const adminEmails = ['admin@wellbianlabs.io']; // client-side mirror of the server allowlist
    const apply = (email: string | null) => {
      if (!alive) return;
      setAccount({
        email,
        isAdmin: !!email && adminEmails.includes(email.toLowerCase()),
      });
    };
    void supabase.auth.getUser().then(({ data }) => apply(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user?.email ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    saveHistory(character.id, messages);
  }, [character.id, messages]);

  // ── Scheduled-greeting poller ────────────────────────────────────────
  // The /api/cron/weather-greeting endpoint runs 4×/day (KST 7am/12pm/6pm/
  // 10pm) and writes a row into `scheduled_messages` for each Premium
  // user, addressed to the character they chatted with most recently.
  // We poll that row store and inject the messages into the chat as if
  // the character just spoke. Server bills only Premium users so anon /
  // free clients get an empty list (the request still runs but is a
  // no-op — kept on for consistency rather than adding a tier-aware
  // branch here).
  //
  // Polling cadence:
  //   - one immediate fetch on mount (catches messages queued while the
  //     user was away)
  //   - then every 60s while the tab is visible — paused via the
  //     visibilitychange listener so a tab in the background doesn't
  //     waste cycles or count against rate limits
  //
  // Dedup: the seen-ids ref guards against the case where a row is
  // returned by the server again before our ack POST completes (e.g.
  // ack request races with the next poll). Server-side `delivered_at`
  // is the source of truth — this ref is just a UX safety belt so the
  // bubble never renders twice in the same tab session.
  const seenScheduledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      // Skip work when the tab is hidden — the user can't see the
      // bubble appear anyway, and the next visibilitychange will fire
      // a fresh poll.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      try {
        const res = await fetch(
          `/api/scheduled/pending?characterId=${encodeURIComponent(character.id)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          items?: Array<{ id: string; content: string; scheduledFor: string }>;
        };
        const items = data.items ?? [];
        if (items.length === 0) return;

        // Filter out anything we've already rendered locally this
        // session — guards against a stale-then-ack race.
        const fresh = items.filter((it) => !seenScheduledRef.current.has(it.id));
        if (fresh.length === 0) return;
        for (const it of fresh) seenScheduledRef.current.add(it.id);

        // Append to the bubble stream as regular assistant turns.
        // They get persisted via the existing saveHistory effect so
        // they survive page refreshes even before ack completes.
        setMessages((prev) => [
          ...prev,
          ...fresh.map((it) => ({
            id: it.id,
            role: 'assistant' as const,
            kind: 'text' as MessageKind,
            content: it.content,
          })),
        ]);

        // Fire-and-forget ack — server will flip delivered_at so the
        // next poll skips them. If this request fails (network blip),
        // the seen-ids ref still protects this tab session, and the
        // worst that happens is the next poll re-fetches them. The
        // ref check above blocks re-render in that case.
        void fetch('/api/scheduled/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: fresh.map((it) => it.id) }),
          credentials: 'include',
        }).catch(() => {
          /* best-effort */
        });
      } catch {
        /* Polling is best-effort. Don't surface transient errors. */
      }
    }

    // Kickoff: fetch immediately on mount so any greetings that piled
    // up while the user was away show up the moment they open the
    // chat — not 60 seconds later.
    void poll();
    const interval = window.setInterval(poll, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [character.id]);

  // Revoke any blob URLs we created for TTS playback when the page
  // unmounts, so the browser doesn't keep audio buffers in memory
  // after the user leaves the chat.
  useEffect(() => {
    return () => {
      for (const m of messages) {
        if (m.ttsUrl) URL.revokeObjectURL(m.ttsUrl);
      }
      // Also stop any active speech recognition on unmount.
      recognitionRef.current?.abort();
    };
    // Intentionally not depending on `messages` — we want this to run
    // ONCE on unmount with the messages snapshot from the last render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus the composer:
  //   1. On mount — so the user can start typing immediately on entry.
  //   2. Whenever `sending` transitions back to false — so the cursor
  //      is back in place the instant a reply finishes streaming,
  //      ready for the next message. Without this, focus is lost the
  //      moment the user clicks 보내기 or a shortcut chip and the user
  //      has to click back into the field every turn.
  // The `?.focus({ preventScroll: true })` keeps the scroll position
  // anchored to the messages area (focus normally tries to scroll the
  // focused element into view, which would yank the chat upward).
  useEffect(() => {
    if (!sending) inputRef.current?.focus({ preventScroll: true });
  }, [sending]);

  useEffect(() => {
    let alive = true;
    fetch('/api/weather?lat=37.498&lng=127.028&label=서울 강남구')
      .then((r) => r.json())
      .then((w: WeatherSnapshot) => {
        if (alive) setWeather(w);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── Voice input (Web Speech API) ─────────────────────────────────
  // The browser-native SpeechRecognition delegates to whatever the OS
  // provides (on Chrome/Edge it routes through Google's servers; on
  // Safari it uses Apple's). We append the live transcript to the
  // input field as the user speaks so they can keep their eyes on
  // the screen and edit by typing right after.
  function startListening() {
    if (listening) return;
    if (typeof window === 'undefined') return;
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setInput((prev) => prev + (prev ? ' ' : '') + '(브라우저가 음성 입력을 지원하지 않아요)');
      return;
    }
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    let finalTranscript = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i += 1) {
        const piece = e.results[i]!;
        const text = piece[0].transcript;
        if (piece.isFinal) finalTranscript += text;
        else interim += text;
      }
      // Show interim transcript live; once final, commit it into the field.
      setInput((prev) => {
        // Strip any previous interim suffix (we tag interim with a marker
        // so we don't keep stacking partial transcripts).
        const base = prev.replace(/\s?⟨[^⟩]*⟩\s?$/, '');
        if (interim) return `${base}${base ? ' ' : ''}⟨${interim}⟩`;
        if (finalTranscript) return `${base}${base ? ' ' : ''}${finalTranscript.trim()}`;
        return base;
      });
    };
    rec.onerror = (e) => {
      console.warn('[voice] err', e?.error);
      setListening(false);
    };
    rec.onend = () => {
      // Clean any leftover interim marker.
      setInput((prev) => prev.replace(/\s?⟨[^⟩]*⟩\s?$/, '').trim());
      setListening(false);
      recognitionRef.current = null;
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (err) {
      console.warn('[voice] start fail', (err as Error).message);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  // ── Camera / file picker → preview pending image ─────────────────
  // We use a hidden <input type="file" capture="environment"> rather
  // than getUserMedia so mobile gets the system camera UI for free
  // (and desktop gets the standard file picker). The selected file
  // is downscaled client-side to keep payloads under our 6MB cap.
  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    try {
      const dataUrl = await downscaleImageToDataUrl(file, 1280, 0.85);
      setPendingImage(dataUrl);
    } catch (err) {
      console.warn('[camera] downscale fail', (err as Error).message);
      // Fallback: raw read (will likely fail server-side validation if
      // > 6MB, but better than nothing).
      const reader = new FileReader();
      reader.onload = () => setPendingImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  // ── TTS playback / download per assistant message ────────────────
  async function playTts(messageId: string) {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.content) return;
    // Reuse cached blob URL if already fetched once.
    if (msg.ttsUrl) {
      const audio = new Audio(msg.ttsUrl);
      void audio.play();
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, ttsLoading: true, ttsError: undefined } : m)),
    );
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.content, characterId: character.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        if (res.status === 429) {
          const tier = (res.headers.get('X-Tier') ?? 'free') as PaywallReason['tier'];
          setPaywall({
            feature: 'tts_chars',
            tier,
            message: data.error?.message ?? `HTTP ${res.status}`,
          });
        }
        throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ttsUrl: url, ttsLoading: false } : m)),
      );
      const audio = new Audio(url);
      void audio.play();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, ttsLoading: false, ttsError: truncate((err as Error).message, 140) }
            : m,
        ),
      );
    }
  }

  /** Cancel an in-flight song generation (user pressed 취소 on the card). */
  function cancelSong(songId: string) {
    songAbortersRef.current[songId]?.abort();
    delete songAbortersRef.current[songId];
    setMessages((prev) =>
      prev.map((m) =>
        m.id === songId && m.music
          ? {
              ...m,
              pending: false,
              music: {
                ...m.music,
                status: 'failed',
                active: false,
                error: '취소했어요.',
              },
            }
          : m,
      ),
    );
  }

  /**
   * Kick off a Suno weather-song generation and poll until it returns a
   * playable URL. The chat card stays mounted the whole time — we update
   * the underlying message's `music` field as state moves
   *
   *   queued (작사 중) → streaming (녹음 중) → done (재생 가능)
   *
   * so the UI can show the right copy and a synthetic progress bar.
   * Suno doesn't expose a real percentage; we derive one from elapsed
   * time + stage so the user can tell the task is alive vs stuck.
   */
  async function generateWeatherSong(songId: string, userText: string) {
    const startedAt = Date.now();
    const aborter = new AbortController();
    songAbortersRef.current[songId] = aborter;

    const updateMusic = (patch: Partial<MusicTrack>, active: boolean) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === songId
            ? {
                ...m,
                pending: active,
                music: {
                  ...(m.music ?? { taskId: '', status: 'queued' }),
                  startedAt,
                  active,
                  ...patch,
                },
              }
            : m,
        ),
      );

    // Initial visible state is 'writing_lyrics' — the chip click is
    // synchronous, but the server-side Gemini call takes 3-5s before
    // anything else can happen. Showing this phase explicitly tells
    // the user "we're working on the words first" instead of a vague
    // generic spinner.
    updateMusic({ status: 'writing_lyrics', pollCount: 0 }, true);

    // ── Kickoff (Gemini lyrics + Suno enqueue, server-side) ─────────
    // The /api/music route does both steps internally — when it
    // returns we should already have lyrics and a Suno taskId.
    let kickoff: {
      taskId?: string;
      title?: string;
      audioUrl?: string;
      lyrics?: string;
      status?: MusicTrack['status'];
      error?: { code?: string; message?: string };
    };
    try {
      const res = await fetch('/api/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          userPrompt: userText,
          title: `${character.displayName}의 오늘 날씨송`,
        }),
        signal: aborter.signal,
      });
      kickoff = await res.json();
      if (!res.ok || !kickoff.taskId) {
        const reason = kickoff.error?.message ?? `HTTP ${res.status}`;
        // Preserve any lyrics the server managed to generate before
        // failing — so the user at least gets to see what Gemini
        // wrote, even though Suno couldn't sing it.
        updateMusic(
          {
            status: 'failed',
            error: truncate(reason, 200),
            lyrics: kickoff.lyrics,
            title: kickoff.title,
          },
          false,
        );
        if (res.status === 429) {
          const tier = (res.headers.get('X-Tier') ?? 'free') as PaywallReason['tier'];
          setPaywall({ feature: 'songs', tier, message: reason });
        }
        delete songAbortersRef.current[songId];
        return;
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        updateMusic({ status: 'failed', error: truncate((err as Error).message, 120) }, false);
      }
      delete songAbortersRef.current[songId];
      return;
    }

    // First response might already be 'done' (Mock adapter is synchronous).
    updateMusic(
      {
        taskId: kickoff.taskId,
        title: kickoff.title,
        audioUrl: kickoff.audioUrl,
        lyrics: kickoff.lyrics,
        status: kickoff.status ?? 'queued',
      },
      kickoff.status !== 'done',
    );
    if (kickoff.status === 'done' && kickoff.audioUrl) {
      delete songAbortersRef.current[songId];
      return;
    }

    // ── Polling loop ────────────────────────────────────────────────
    // 90s deadline — Suno's p99 is ~80s. Beyond that we surface a
    // honest "still working" error so the user isn't stuck staring at a
    // pulsing card forever. Polling interval: 3s (a bit tighter than
    // before so the progress bar feels responsive).
    const taskId = kickoff.taskId;
    const deadline = startedAt + 90_000;
    let pollCount = 0;
    while (Date.now() < deadline && !aborter.signal.aborted) {
      await new Promise((r) => setTimeout(r, 3000));
      if (aborter.signal.aborted) return;
      pollCount += 1;
      try {
        const r = await fetch(`/api/music?taskId=${encodeURIComponent(taskId)}`, {
          signal: aborter.signal,
        });
        const d = (await r.json()) as {
          status?: MusicTrack['status'];
          audioUrl?: string;
          title?: string;
          lyrics?: string;
          error?: { message?: string };
        };
        if (!r.ok) {
          updateMusic(
            {
              status: 'failed',
              error: truncate(d.error?.message ?? `HTTP ${r.status}`, 140),
              pollCount,
            },
            false,
          );
          delete songAbortersRef.current[songId];
          return;
        }
        updateMusic(
          {
            status: d.status ?? 'queued',
            audioUrl: d.audioUrl,
            title: d.title,
            lyrics: d.lyrics,
            pollCount,
          },
          d.status !== 'done' && d.status !== 'failed',
        );
        if (d.status === 'done' || d.status === 'failed') {
          delete songAbortersRef.current[songId];
          return;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Transient network blip — keep polling until deadline.
        updateMusic({ pollCount }, true);
      }
    }
    updateMusic(
      {
        status: 'failed',
        error: '90초 동안 응답이 없어서 멈췄어요. 잠시 후 다시 시도해줘.',
        pollCount,
      },
      false,
    );
    delete songAbortersRef.current[songId];
  }

  async function send(text: string) {
    // Allow empty text when a photo is queued — the chat route fills
    // in "이 사진 어때?" server-side so the LLM gets a real prompt.
    if (sending) return;
    if (!text && !pendingImage) return;
    // Phase 3: paywall is triggered by 429 from the server, not by
    // the client-side counter. MAX_FREE_MESSAGES is left as a stub
    // (Infinity) so this branch never fires; the real gate lives in
    // /api/chat's consumeQuota() call.
    if (getTodayCount() >= MAX_FREE_MESSAGES) return;
    // Snapshot then clear UI state — the image is sent as part of
    // this turn and must not stick around for the next message.
    const attachedImage = pendingImage;
    setInput('');
    setPendingImage(null);
    setSending(true);
    lastUserMessageRef.current = text;

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    // Show the attached image as the user's bubble alongside their
    // text so the chat record visually matches what the LLM saw.
    setMessages((prev) => [
      ...prev,
      ...(attachedImage
        ? [
            {
              id: crypto.randomUUID(),
              role: 'user' as const,
              kind: 'image' as const,
              imageUrl: attachedImage,
            },
          ]
        : []),
      { id: userId, role: 'user', kind: 'text', content: text || '(사진을 보냈어)' },
      { id: assistantId, role: 'assistant', kind: 'text', content: '', pending: true },
    ]);

    let imageIntentTriggered = false;
    let songIntentTriggered = false;
    let productCard: ProductPayload | null = null;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          text,
          nickname,
          imageDataUrl: attachedImage ?? undefined,
        }),
      });
      // Pull quota state from response headers — every /api/chat
      // response (success or error) carries them. We trust these
      // over any client-side counter.
      applyQuotaHeaders(res.headers, setQuota);

      // Non-2xx responses (e.g. 503 no_vision_provider, 400 validation,
      // 429 rate_limit) come back as JSON, not SSE. Surface the
      // server's message into the assistant bubble directly so the
      // user sees what to fix.
      //
      // 429 specifically also pops the paywall modal — that's the
      // signal we use to convert daily-cap hits into a subscription
      // upsell. The X-Quota-Field header tells us which feature
      // hit the wall (messages vs vision when an image was attached).
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        const reason = errBody.error?.message ?? `HTTP ${res.status}`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: reason, pending: false } : m,
          ),
        );
        if (res.status === 429) {
          const field = (res.headers.get('X-Quota-Field') ?? 'messages') as PaywallReason['feature'];
          const tier = (res.headers.get('X-Tier') ?? 'free') as PaywallReason['tier'];
          setPaywall({ feature: field, tier, message: reason });
        }
        return;
      }
      if (!res.body) throw new Error('no_body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = '';
      let sawError: string | null = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as {
              type: string;
              delta?: string;
              name?: string;
              message?: string;
              payload?: { kind?: string } & Record<string, unknown>;
            };
            if (evt.type === 'token' && evt.delta) {
              assistant += evt.delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistant, pending: false } : m,
                ),
              );
            } else if (evt.type === 'tool' && evt.name === 'request_image') {
              imageIntentTriggered = true;
            } else if (evt.type === 'tool' && evt.name === 'request_song') {
              songIntentTriggered = true;
            } else if (evt.type === 'attachment' && evt.payload?.kind === 'product') {
              productCard = evt.payload as unknown as ProductPayload;
            } else if (evt.type === 'error') {
              sawError = evt.message ?? 'unknown';
            }
          } catch {
            /* partial */
          }
        }
      }

      // Stream ended without any token AND no fallback text → show a visible
      // error instead of leaving the bubble stuck on "···".
      if (!assistant) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: sawError
                    ? `응답을 받지 못했어요. (${sawError})`
                    : '응답이 비어있어요. 잠시 후 다시 시도해주세요.',
                  pending: false,
                }
              : m,
          ),
        );
      }

      setUsage(bumpTodayCount());

      if (productCard) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            kind: 'product',
            product: productCard ?? undefined,
          },
        ]);
      }

      if (imageIntentTriggered) {
        const imageId = crypto.randomUUID();
        setMessages((prev) => [
          ...prev,
          { id: imageId, role: 'assistant', kind: 'image', pending: true },
        ]);
        try {
          const imgRes = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: character.id, userPrompt: text, intent: 'selfie' }),
          });
          // Check HTTP status BEFORE trusting the body. A 502 from the
          // image route still parses as JSON ({error:{...}}) and would
          // otherwise leave imageUrl undefined → silently empty bubble.
          const data = (await imgRes.json()) as {
            imageUrl?: string;
            error?: { code?: string; message?: string };
          };
          if (!imgRes.ok || !data.imageUrl) {
            const reason = data.error?.message ?? `HTTP ${imgRes.status}`;
            // Friendly Korean copy + the server reason in parens so the
            // user can paste it to us when reporting issues.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === imageId
                  ? {
                      ...m,
                      kind: 'text',
                      content: `사진을 그리지 못했어. (${truncate(reason, 140)})`,
                      pending: false,
                    }
                  : m,
              ),
            );
            if (imgRes.status === 429) {
              const tier = (imgRes.headers.get('X-Tier') ?? 'free') as PaywallReason['tier'];
              setPaywall({ feature: 'selfies', tier, message: reason });
            }
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === imageId ? { ...m, imageUrl: data.imageUrl, pending: false } : m,
              ),
            );
          }
        } catch (err) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === imageId
                ? {
                    ...m,
                    kind: 'text',
                    content: `사진 요청이 끊겼어. (${truncate((err as Error).message, 120)})`,
                    pending: false,
                  }
                : m,
            ),
          );
        }
      }

      // ── Weather song generation ────────────────────────────────────
      // Suno takes 20–60s, so we render a music card immediately in
      // "queued" status and poll /api/music?taskId=... until done. The
      // card transitions through queued → streaming → done with the
      // audio element appearing once an audioUrl is available.
      if (songIntentTriggered) {
        const songId = crypto.randomUUID();
        setMessages((prev) => [
          ...prev,
          {
            id: songId,
            role: 'assistant',
            kind: 'music',
            pending: true,
            music: { taskId: '', status: 'queued' },
          },
        ]);
        void generateWeatherSong(songId, text);
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: '연결이 끊어졌어요. 잠시 후 다시 시도해주세요.',
                pending: false,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function handleRegenerate() {
    const last = lastUserMessageRef.current;
    if (!last) return;
    setMessages((prev) => {
      const lastAssistantIdx = [...prev].reverse().findIndex((m) => m.role === 'assistant');
      if (lastAssistantIdx < 0) return prev;
      const idx = prev.length - 1 - lastAssistantIdx;
      return prev.slice(0, idx);
    });
    void send(last);
  }

  return (
    <WeatherBackground condition={weather?.condition ?? 'clear'}>
      <main className="mx-auto flex h-screen max-w-2xl flex-col">
        {/* HEADER */}
        <header className="border-b border-brand-ink/10 bg-brand-paper/70 backdrop-blur-md">
          <div className="flex items-center justify-between px-6 py-4">
            <Link
              href="/characters"
              className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
            >
              ← Home
            </Link>
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full font-display text-sm text-white"
                style={{ background: character.accentColor }}
              >
                {character.displayNameEn.charAt(0)}
              </div>
              <span
                className="font-display text-2xl font-medium tracking-tight"
                style={{ color: character.accentColor }}
              >
                {character.displayName}
              </span>
            </div>
            <AccountChip account={account} quota={quota} fallbackUsage={usage} />
          </div>
          <div className="border-t border-brand-ink/8 bg-brand-paper/50 px-6 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
              {weather
                ? `${weather.location.label} · ${weather.temperatureC}°C · ${WEATHER_LABEL[weather.condition] ?? weather.condition}`
                : `${character.originRegion} · loading…`}
            </span>
          </div>
        </header>

        {/* MESSAGES */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.kind === 'image' ? (
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  {m.pending ? (
                    <ImageGeneratingState accent={character.accentColor} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt={`${character.displayName} selfie`}
                      width={256}
                      height={256}
                      className="block h-64 w-64 object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>
              ) : m.kind === 'product' && m.product ? (
                <ProductCardView
                  product={m.product}
                  accent={character.accentColor}
                  from={character.displayName}
                />
              ) : m.kind === 'music' && m.music ? (
                <WeatherSongCard
                  track={m.music}
                  accent={character.accentColor}
                  from={character.displayName}
                  weatherLabel={weather ? WEATHER_LABEL[weather.condition] ?? weather.condition : ''}
                  onCancel={() => cancelSong(m.id)}
                />
              ) : (
                <ChatBubble
                  message={m}
                  accentColor={character.accentColor}
                  onRegenerate={handleRegenerate}
                  onPlayTts={playTts}
                />
              )}
            </div>
          ))}
        </div>

        {/* COMPOSER */}
        <div className="border-t border-brand-ink/10 bg-brand-paper/70 backdrop-blur-md">
          <div className="flex gap-2 overflow-x-auto px-6 pt-3">
            {SHORTCUTS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={sending}
                onClick={() => void send(s.text)}
                className="shrink-0 rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 font-sans text-[12px] text-brand-ink-soft transition hover:border-brand-ink/30 hover:text-brand-ink disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Pending image preview — appears above the input row while
              the user has a queued photo. Tap × to drop it. */}
          {pendingImage ? (
            <div className="flex items-center gap-2 px-6 pt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingImage}
                alt="첨부 사진 미리보기"
                className="h-14 w-14 rounded-lg object-cover ring-1 ring-brand-ink/10"
              />
              <span className="flex-1 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
                사진이 함께 전송돼요
              </span>
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                aria-label="사진 제거"
                className="rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
              >
                × 제거
              </button>
            </div>
          ) : null}

          <form
            className="flex items-center gap-2 px-6 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input.trim());
            }}
          >
            {/* Hidden file input — the 📷 button triggers it. `capture`
                hints mobile browsers to open the camera; desktop just
                gets the standard file picker. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImageFile(f);
                e.target.value = ''; // allow picking the same file twice in a row
              }}
            />

            {/* Camera button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="카메라로 사진 첨부"
              title="카메라 / 갤러리로 사진 첨부 (Claude Vision)"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-ink/12 bg-white text-brand-ink-soft transition hover:border-brand-ink/30 hover:text-brand-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>

            {/* Voice input button — toggles SpeechRecognition. Pulses red
                while listening so the user can tell mic is hot. */}
            <button
              type="button"
              onClick={() => (listening ? stopListening() : startListening())}
              aria-label={listening ? '음성 입력 중지' : '음성으로 입력'}
              aria-pressed={listening}
              title={listening ? '음성 입력 중… 다시 클릭하면 중지' : '음성으로 입력 (한국어)'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                listening
                  ? 'border-red-400/60 bg-red-50 text-red-500 animate-pulse'
                  : 'border-brand-ink/12 bg-white text-brand-ink-soft hover:border-brand-ink/30 hover:text-brand-ink'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect
                  x="9"
                  y="3"
                  width="6"
                  height="11"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                listening
                  ? '듣고 있어요… 말해주세요'
                  : pendingImage
                    ? '사진에 대해 물어볼 말 (생략 가능)…'
                    : '메시지를 입력하세요…'
              }
              autoFocus
              autoComplete="off"
              className="h-11 flex-1 rounded-full border border-brand-ink/12 bg-white px-5 font-sans text-[15px] text-brand-ink outline-none transition focus:border-brand-ink/40"
            />
            <button
              type="submit"
              disabled={sending || (!input.trim() && !pendingImage)}
              className="flex h-11 min-w-[72px] items-center justify-center rounded-full px-5 font-sans text-[14px] font-medium text-white transition disabled:opacity-60"
              style={{ background: character.accentColor }}
            >
              {sending ? (
                <span className="inline-flex items-center gap-1" aria-label="전송 중">
                  {[0, 160, 320].map((delay) => (
                    <span
                      key={delay}
                      className="inline-block h-1.5 w-1.5 animate-typing-bounce rounded-full bg-white"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              ) : (
                '보내기'
              )}
            </button>
          </form>
        </div>

        {paywall ? (
          <PaywallModal
            reason={paywall}
            characterDisplayName={character.displayName}
            accentColor={character.accentColor}
            onClose={() => setPaywall(null)}
          />
        ) : null}
      </main>
    </WeatherBackground>
  );
}

function ChatBubble({
  message,
  accentColor,
  onRegenerate,
  onPlayTts,
}: {
  message: UIMessage;
  accentColor: string;
  onRegenerate: () => void;
  onPlayTts: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (message.role === 'user') {
    return (
      <div
        className="max-w-[80%] rounded-2xl px-4 py-2.5 font-sans text-[15px] leading-relaxed text-white shadow-xs"
        style={{ background: accentColor }}
      >
        {message.content || ' '}
      </div>
    );
  }
  const streaming = message.pending && !!message.content;
  const ttsFilename = `${message.id.slice(0, 8)}.mp3`;
  // Safety net: strip any markdown image / HTML img / placeholder
  // URLs / standalone hr lines the LLM might emit despite the
  // system-prompt rules. Server-side prompt is the primary defense;
  // this is the second line so the user never sees a fake
  // !\[](https://...) inline.
  const displayContent = sanitizeAssistantText(message.content);
  return (
    <div
      className="max-w-[80%] cursor-pointer rounded-2xl bg-white px-4 py-2.5 font-sans text-[15px] leading-relaxed text-brand-ink shadow-xs"
      onClick={() => message.content && setOpen((v) => !v)}
    >
      {message.pending && !message.content ? (
        <TypingDots accent={accentColor} />
      ) : (
        <>
          {displayContent || ' '}
          {streaming ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[3px] animate-cursor-blink rounded-sm"
              style={{ background: accentColor }}
            />
          ) : null}
        </>
      )}
      {open && message.content ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-brand-ink/10 pt-2">
          {/* Voice playback — fetches /api/tts on first click and
              caches the blob URL on the message. Subsequent clicks
              just replay the cached audio. */}
          <button
            type="button"
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft transition hover:text-brand-ink disabled:opacity-50"
            disabled={message.ttsLoading}
            onClick={(e) => {
              e.stopPropagation();
              onPlayTts(message.id);
            }}
            title="음성으로 듣기"
          >
            {message.ttsLoading ? (
              <span className="inline-flex items-center gap-0.5">
                {[0, 160, 320].map((d) => (
                  <span
                    key={d}
                    className="inline-block h-1 w-1 animate-typing-bounce rounded-full"
                    style={{ background: accentColor, animationDelay: `${d}ms` }}
                  />
                ))}
              </span>
            ) : (
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <path d="M3 6h2l3-3v10L5 10H3z" fill="currentColor" />
                <path
                  d="M11 6c1 .8 1 3.2 0 4M13 4c2 1.6 2 6.4 0 8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <span>{message.ttsUrl ? '다시 듣기' : '음성 듣기'}</span>
          </button>

          {/* Download button — only enabled after the TTS blob has been
              fetched at least once (i.e., user pressed 음성 듣기). */}
          {message.ttsUrl ? (
            <a
              href={message.ttsUrl}
              download={ttsFilename}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft transition hover:text-brand-ink"
              title="MP3 다운로드"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M8 1 V11 M4 7 L8 11 L12 7 M2 14 H14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              MP3
            </a>
          ) : null}

          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(sanitizeAssistantText(message.content) ?? '');
              setOpen(false);
            }}
          >
            Copy
          </button>
          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRegenerate();
            }}
          >
            Regenerate
          </button>
          {message.ttsError ? (
            <span className="font-mono text-[10px] text-red-500">{message.ttsError}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Music card for the 날씨송 feature.
 *
 *   queued    → "작사하는 중"  (progress bar + elapsed seconds + cancel)
 *   streaming → "녹음하는 중"  (progress bar + elapsed seconds + cancel)
 *   done      → audio player + collapsible lyrics
 *   failed    → friendly error + the underlying reason
 *
 * Suno doesn't expose a real percentage. We derive one from elapsed time
 * + stage so the bar feels alive:
 *   - 0–60% of bar maps to the 'queued' stage over ~30s
 *   - 60–95% maps to the 'streaming' stage
 *   - 100% jumps the moment status becomes 'done'
 * If the user sees "30초 · 작sa 중" and the bar moving, they know the
 * task is live. If polls stop ticking, they can hit 취소.
 */
function WeatherSongCard({
  track,
  accent,
  from,
  weatherLabel,
  onCancel,
}: {
  track: MusicTrack;
  accent: string;
  from: string;
  weatherLabel: string;
  onCancel: () => void;
}) {
  // Tick once a second so elapsed time + progress bar refresh while the
  // task is in flight. Stops ticking once the track is terminal.
  const [, setTick] = useState(0);
  const isActive =
    track.active &&
    (track.status === 'writing_lyrics' ||
      track.status === 'queued' ||
      track.status === 'streaming');
  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [isActive]);

  const title = track.title ?? `${from}의 오늘 날씨송`;
  const subtitle = weatherLabel ? `${weatherLabel} · ${from}` : from;
  const elapsedSec = track.startedAt
    ? Math.max(0, Math.round((Date.now() - track.startedAt) / 1000))
    : 0;

  // Synthetic progress bar — three observable phases laid end-to-end
  // along the bar so the user can see where in the pipeline we are:
  //   writing_lyrics (Gemini) : 0  →  20% over ~5s
  //   queued        (Suno q)  : 20 →  35% over ~5s
  //   streaming     (Suno mix): 35 →  95% over ~40s
  //   done                    : 100% instantly
  //   failed                  : freeze where we were
  let pct = 0;
  if (track.status === 'done') pct = 100;
  else if (track.status === 'writing_lyrics') pct = Math.min(20, (elapsedSec / 5) * 20);
  else if (track.status === 'queued')
    pct = 20 + Math.min(15, ((elapsedSec - 5) / 5) * 15);
  else if (track.status === 'streaming')
    pct = 35 + Math.min(60, ((elapsedSec - 10) / 40) * 60);
  else if (track.status === 'failed') pct = Math.max(8, Math.min(95, pct || 25));

  let statusCopy = '';
  if (track.status === 'writing_lyrics') statusCopy = '가사 쓰는 중';
  else if (track.status === 'queued') statusCopy = '음악 만들기 시작';
  else if (track.status === 'streaming') statusCopy = '녹음하는 중';
  else if (track.status === 'done') statusCopy = '완성!';
  else if (track.status === 'failed') statusCopy = '실패';

  // Build a clean filename for the download proxy. ASCII-only so the
  // server-side sanitizer doesn't have to strip it again.
  const downloadName =
    `${title}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) ||
    `weather-song`;
  const downloadHref = track.audioUrl
    ? `/api/music/download?url=${encodeURIComponent(track.audioUrl)}&name=${encodeURIComponent(downloadName)}.mp3`
    : '';

  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white shadow-md">
      {/* Album-cover style header */}
      <div
        className="relative h-36 w-full"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, #241b3e 100%)` }}
      >
        {isActive ? (
          <div
            aria-hidden
            className="absolute inset-0 animate-sheen-sweep"
            style={{
              background:
                'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
              backgroundSize: '200% 100%',
            }}
          />
        ) : null}
        <div className="absolute inset-x-4 top-3 flex items-start justify-between text-white">
          <span className="font-mono text-[9px] uppercase tracking-eyebrow opacity-90">
            Weather Song
          </span>
          {track.status === 'done' ? (
            <span className="rounded-full bg-white/25 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow backdrop-blur-sm">
              ✓ 완성
            </span>
          ) : null}
        </div>
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between text-white">
          <span aria-hidden className="font-display text-4xl leading-none">
            ♪
          </span>
        </div>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        <div className="font-display text-lg leading-tight tracking-tight text-brand-ink">
          {title}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
          {subtitle}
        </div>

        {/* Player / progress / error — the audio-bearing top of the body */}
        {track.status === 'done' && track.audioUrl ? (
          <AudioPlayer
            src={track.audioUrl}
            accent={accent}
            downloadHref={downloadHref}
            downloadName={`${downloadName}.mp3`}
          />
        ) : track.status === 'failed' ? (
          // The /api/music error envelope now always carries a complete,
          // user-ready Korean sentence (see buildUserFacingMusicError in
          // packages/ai/src/adapters/suno.ts) — render it as-is. We only
          // fall back to the generic prefix when there's no message at
          // all (e.g. client-side abort before the server replied).
          <p className="font-sans text-[13px] leading-relaxed text-brand-ink-soft">
            {track.error ? (
              <Linkified text={track.error} accent={accent} />
            ) : (
              '노래를 만들지 못했어. 잠시 후 다시 시도해줄래?'
            )}
          </p>
        ) : (
          <SongProgress
            pct={pct}
            statusCopy={statusCopy}
            elapsedSec={elapsedSec}
            pollCount={track.pollCount ?? 0}
            accent={accent}
            onCancel={onCancel}
          />
        )}

        {/* Lyrics — render whenever we have them, regardless of audio
            state. Gemini pre-generates them before Suno starts so the
            user can read along during the 30-60s music wait. */}
        {track.lyrics ? <LyricsView lyrics={track.lyrics} accent={accent} /> : null}
      </div>
    </div>
  );
}

/**
 * Progress UI for an in-flight song: a thin horizontal bar tinted to the
 * character's accent, plus a meta line that shows stage + elapsed time +
 * poll count + a Cancel button. The poll count is what tells the user
 * "we're still talking to Suno" vs "we're stuck" — if it doesn't tick up
 * for ~10 seconds, something's wrong.
 */
function SongProgress({
  pct,
  statusCopy,
  elapsedSec,
  pollCount,
  accent,
  onCancel,
}: {
  pct: number;
  statusCopy: string;
  elapsedSec: number;
  pollCount: number;
  accent: string;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-ink/10">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, Math.round(pct))}%`, background: accent }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
          {statusCopy} · {elapsedSec}초 · {pollCount}회 확인
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
        >
          취소
        </button>
      </div>
    </div>
  );
}

/**
 * Custom audio player styled to live inside a chat card.
 *
 * Why not use the browser's native `<audio controls>`? Two reasons:
 *   1. The default controls vary widely by OS/browser (Chrome bar vs
 *      Safari rounded vs Firefox slim) and never match our pastel
 *      character-tinted aesthetic.
 *   2. The native bar is a single 40px row that competes with the
 *      download button for visual weight — users had a hard time
 *      finding the play button. The custom version gives the play
 *      button a 48px circular target that's unmistakable.
 *
 * Still uses a hidden `<audio>` element under the hood for all the
 * actual decoding / buffering / streaming — we just drive it from
 * React state and render our own buttons + scrubber.
 */
function AudioPlayer({
  src,
  accent,
  downloadHref,
  downloadName,
}: {
  src: string;
  accent: string;
  downloadHref: string;
  downloadName: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onDur = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onLoaded = () => setLoaded(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('durationchange', onDur);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('durationchange', onDur);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="rounded-2xl bg-brand-paper p-3">
      {/* Hidden underlying element — drives playback; not visible. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <div className="flex items-center gap-3">
        {/* Big circular play/pause */}
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? '일시정지' : '재생'}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition hover:scale-105 active:scale-95"
          style={{ background: accent }}
        >
          {playing ? (
            // Pause icon — two vertical bars
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" fill="currentColor" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" fill="currentColor" />
            </svg>
          ) : (
            // Play icon — right-pointing triangle
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />
            </svg>
          )}
        </button>

        {/* Scrubber column */}
        <div className="flex flex-1 flex-col gap-1.5">
          <div
            role="slider"
            tabIndex={0}
            aria-label="재생 위치"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={current}
            onClick={seek}
            className="group h-1.5 cursor-pointer rounded-full bg-brand-ink/10"
          >
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tabular-nums text-brand-ink-soft">
              {fmtTime(current)} / {loaded ? fmtTime(duration) : '--:--'}
            </span>
            <a
              href={downloadHref}
              download={downloadName}
              aria-label="MP3 다운로드"
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft transition hover:text-brand-ink"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M8 1 V11 M4 7 L8 11 L12 7 M2 14 H14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              MP3 다운로드
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Render text with bare `https://...` URLs turned into clickable links.
 * The error copy from our adapters embeds action URLs (e.g. Suno
 * billing, OpenAI billing) as plain strings — this lets the user
 * one-tap to the page that fixes the problem.
 *
 * Match is conservative on purpose: only http/https, no trailing
 * punctuation, max 200 chars. Anything weirder is left as text.
 */
function Linkified({ text, accent }: { text: string; accent: string }) {
  const URL_RE = /(https?:\/\/[^\s)(]{1,200})/g;
  const parts: Array<{ kind: 'text' | 'link'; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) });
    parts.push({ kind: 'link', value: m[1]! });
    last = start + m[1]!.length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });

  return (
    <>
      (
      {parts.map((p, i) =>
        p.kind === 'link' ? (
          <a
            key={i}
            href={p.value}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition hover:opacity-80"
            style={{ color: accent }}
          >
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
      )
    </>
  );
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Render Suno-generated lyrics with section structure preserved.
 *
 * Suno emits lyrics with bracketed section markers ([Verse 1], [Chorus],
 * [Bridge], [Outro], etc.) plus blank lines between sections. The raw
 * text rendered as a `<pre>` (our old approach) reads as a wall of
 * Korean/English mixed and the user can't tell where the chorus starts.
 *
 * We parse on the fly:
 *   - Lines matching `/^\s*\[(.+?)\]\s*$/` become section labels (eyebrow style,
 *     accent-tinted, with a thin divider).
 *   - Non-empty content lines render as plain body text.
 *   - Empty lines add vertical breathing room between sections.
 *
 * Markdown bold/asterisks (Suno sometimes wraps lines in **) are stripped.
 */
function LyricsView({ lyrics, accent }: { lyrics: string; accent: string }) {
  const sections = useMemo(() => parseLyrics(lyrics), [lyrics]);
  const [expanded, setExpanded] = useState(false);
  // Compute total line count so the toggle only shows when there's a
  // real reason to collapse (short lyrics fit fully without scrolling).
  const totalLines = sections.reduce((n, s) => n + s.lines.length, 0);
  const isLong = totalLines > 12;
  const collapsed = isLong && !expanded;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
          가사 · {totalLines}줄
        </span>
        {isLong ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
          >
            {expanded ? '접기' : '전체 보기'}
          </button>
        ) : null}
      </div>
      <div className="relative">
        <div
          className={`space-y-3 rounded-xl bg-brand-paper px-3.5 py-3 ${
            collapsed ? 'max-h-56 overflow-hidden' : ''
          }`}
        >
          {sections.map((sec, i) => (
            <div key={i}>
              {sec.label ? (
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="inline-block h-[3px] w-3 rounded-full"
                    style={{ background: accent }}
                  />
                  <span
                    className="font-mono text-[10px] uppercase tracking-eyebrow"
                    style={{ color: accent }}
                  >
                    {sec.label}
                  </span>
                </div>
              ) : null}
              {sec.lines.map((line, j) => (
                <p
                  key={j}
                  className="font-sans text-[13px] leading-[1.7] text-brand-ink"
                >
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
        {/* Bottom fade when collapsed — visual hint there's more content */}
        {collapsed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-xl bg-gradient-to-t from-brand-paper to-transparent"
          />
        ) : null}
      </div>
    </div>
  );
}

interface LyricsSection {
  label: string | null;
  lines: string[];
}

function parseLyrics(raw: string): LyricsSection[] {
  // Strip markdown bold markers Suno sometimes wraps lines in.
  const text = raw.replace(/\*\*/g, '').trim();
  const lines = text.split(/\r?\n/);
  const sections: LyricsSection[] = [];
  let current: LyricsSection = { label: null, lines: [] };
  const sectionHeader = /^\s*\[(.+?)\]\s*$/;

  for (const raw of lines) {
    const line = raw.trim();
    const m = sectionHeader.exec(line);
    if (m) {
      // Push the previous section if it has any content (or a label).
      if (current.label || current.lines.length > 0) sections.push(current);
      current = { label: m[1]!.trim(), lines: [] };
      continue;
    }
    if (!line) continue;
    current.lines.push(line);
  }
  if (current.label || current.lines.length > 0) sections.push(current);
  // Edge case: lyrics with no section markers at all → wrap as a single
  // unlabeled block so the user still sees structured text.
  if (sections.length === 0) sections.push({ label: null, lines: [text] });
  return sections;
}

/**
 * Quota-triggered paywall modal.
 *
 * Pops the moment a quota-gated API route returns 429. Copy differs
 * by:
 *
 *   tier=anon     → "Sign up to unlock" with /login CTA
 *   tier=free     → "Upgrade to Premium" with /pricing CTA
 *   tier=premium  → "내일 다시 만나" (premium hit their already-
 *                   generous daily cap; nothing more to upsell, just
 *                   reassure)
 *
 * The `feature` field also tunes the headline so the user sees the
 * specific reason ("셀카 한도", "날씨송 한도", etc.) instead of a
 * generic "limit reached".
 */
interface PaywallReason {
  feature: 'messages' | 'selfies' | 'songs' | 'tts_chars' | 'vision';
  tier: 'anon' | 'free' | 'premium' | 'admin';
  message?: string;
}

const FEATURE_LABEL: Record<PaywallReason['feature'], string> = {
  messages: '오늘의 대화',
  selfies: '오늘의 셀카',
  songs: '오늘의 날씨송',
  tts_chars: '오늘의 음성',
  vision: '오늘의 사진 분석',
};

function PaywallModal({
  reason,
  characterDisplayName,
  accentColor,
  onClose,
}: {
  reason: PaywallReason;
  characterDisplayName: string;
  accentColor: string;
  onClose: () => void;
}) {
  const featureLabel = FEATURE_LABEL[reason.feature];

  // Per-tier headline + body + primary CTA.
  let headline: string;
  let body: string;
  let primaryLabel: string;
  let primaryHref: string;
  if (reason.tier === 'anon') {
    headline = `로그인하고 ${characterDisplayName}와 더 깊게.`;
    body = `${featureLabel} 한도가 다 차서 잠시 멈췄어요. 무료로 가입하면 매일 더 많은 대화와 ${reason.feature === 'selfies' ? '셀카' : reason.feature === 'songs' ? '날씨송' : '기능'}을 쓸 수 있어요.`;
    primaryLabel = '로그인 / 가입하기';
    primaryHref = '/login';
  } else if (reason.tier === 'premium' || reason.tier === 'admin') {
    headline = '내일 다시 만나.';
    body = `오늘 정해진 ${featureLabel} 한도를 다 썼어요. 자정(KST) 지나면 새 하루로 자동 충전됩니다.`;
    primaryLabel = '확인';
    primaryHref = '#';
  } else {
    headline = 'Premium으로 한도를 늘려보자.';
    body = `${featureLabel} 무료 한도를 다 썼어요. Premium 구독자는 셀카 20장 · 날씨송 3곡 · 대화 200회까지 매일 가능해요.`;
    primaryLabel = '플랜 보기';
    primaryHref = '/pricing';
  }

  // Per-feature highlight bullets — different teaser depending on
  // what they tried to do.
  const bullets: string[] = (() => {
    switch (reason.feature) {
      case 'selfies':
        return ['셀카 1 → 20장/일', '날씨에 맞는 의상/배경', 'Reference 얼굴 일관성'];
      case 'songs':
        return ['날씨송 0 → 3곡/일', 'Gemini 가사 + Suno V4.5', 'MP3 다운로드'];
      case 'vision':
        return ['사진 분석 3 → 50회/일', 'Claude Vision 풀 분석', '캐릭터 보이스로 답변'];
      case 'tts_chars':
        return ['음성 듣기 무제한', '캐릭터별 보이스', 'MP3 다운로드'];
      case 'messages':
      default:
        return ['메시지 30 → 200/일', '깊이 있는 Claude 모델', '장기 기억 + 광고 제거'];
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 p-4 md:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Eyebrow>★ {reason.tier === 'anon' ? 'Sign up' : 'Premium'}</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-brand-ink">
          {headline}
        </h2>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-brand-ink-soft">
          {body}
        </p>
        <ul className="mt-4 space-y-2 font-sans text-sm text-brand-ink-soft">
          {bullets.map((b) => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
        {reason.message ? (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft/60">
            {reason.message}
          </p>
        ) : null}
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" size="md" fullWidth onClick={onClose}>
            다음에
          </Button>
          {primaryHref === '#' ? (
            <Button
              variant="accent"
              size="md"
              fullWidth
              accentColor={accentColor}
              onClick={onClose}
            >
              {primaryLabel}
            </Button>
          ) : (
            <a
              href={primaryHref}
              className="flex h-11 flex-1 items-center justify-center rounded-full px-5 font-sans text-[14px] font-medium text-white transition hover:opacity-90"
              style={{ background: accentColor }}
            >
              {primaryLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Header-right chip showing the current login state.
 *
 *   • Admin signed in    → red ADMIN pill (instantly recognizable)
 *   • Regular user       → email + "Logout" link
 *   • Anonymous          → "Login" link to /login
 *
 * Phase 1 also keeps the today's-usage counter visible underneath
 * (informational only; not enforced yet — Phase 2 hooks it up to a
 * server-backed quota).
 */
function AccountChip({
  account,
  quota,
  fallbackUsage,
}: {
  account: { email: string | null; isAdmin: boolean } | null;
  /** Server-reported quota for the messages field. Null until the
   *  first chat round-trip lands, or null forever if the server
   *  isn't wired up yet (Phase 2 disabled). */
  quota: { used: number; limit: number | null } | null;
  /** Phase-1 localStorage counter — used only when `quota` is null
   *  (e.g. before the first send, or in anon mode where the server
   *  doesn't meter us). Lets the badge always show *something*. */
  fallbackUsage: number;
}) {
  const email = account?.email ?? null;
  const isAdmin = account?.isAdmin ?? false;

  // Pick the most truthful counter we have:
  //   - admin: always show "오늘 ∞" (no cap)
  //   - signed-in with server-fed quota: show "N/limit" or "N today" if unlimited
  //   - else: fall back to client-side counter
  let counterText: string;
  if (isAdmin) {
    counterText = '오늘 ∞';
  } else if (quota) {
    if (quota.limit == null) counterText = `오늘 ${quota.used}회`;
    else counterText = `${quota.used} / ${quota.limit}`;
  } else {
    counterText = `오늘 ${fallbackUsage}회`;
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      {isAdmin ? (
        <a
          href="/auth/logout"
          className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-red-600 hover:bg-red-500/25"
          title={`${email} — 로그아웃`}
        >
          ★ Admin
        </a>
      ) : email ? (
        <div className="flex items-center gap-1.5">
          <span
            className="max-w-[120px] truncate font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft"
            title={email}
          >
            {email.split('@')[0]}
          </span>
          <a
            href="/auth/logout"
            className="font-mono text-[9px] uppercase tracking-eyebrow text-brand-ink-soft/70 hover:text-brand-ink"
          >
            ↗
          </a>
        </div>
      ) : (
        <a
          href="/login"
          className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
        >
          Login →
        </a>
      )}
      <span className="font-mono text-[9px] uppercase tracking-eyebrow text-brand-ink-soft/70">
        {counterText}
      </span>
    </div>
  );
}

/**
 * Three-dot typing indicator. Each dot bounces on the same keyframes but is
 * offset by a 160ms stagger so the wave reads as a single travelling pulse.
 * Tinted to the character's accent color so it feels like *that* character
 * is thinking, not a generic system spinner.
 */
function TypingDots({ accent }: { accent: string }) {
  return (
    <span className="inline-flex items-center gap-1 py-[3px]" aria-label="응답 입력 중">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="inline-block h-1.5 w-1.5 animate-typing-bounce rounded-full"
          style={{ background: accent, animationDelay: `${delay}ms` }}
        />
      ))}
      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        입력 중
      </span>
    </span>
  );
}

/**
 * Loader for assistant-generated images. Diagonal gradient sweep across the
 * placeholder plus a tinted caption — communicates "this is being drawn"
 * rather than "this failed to load."
 */
function ImageGeneratingState({ accent }: { accent: string }) {
  return (
    <div className="relative flex h-64 w-64 items-center justify-center overflow-hidden bg-brand-paper">
      {/* Diagonal sheen sweep */}
      <div
        aria-hidden
        className="absolute inset-0 animate-sheen-sweep"
        style={{
          background:
            'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.65) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-2.5">
        <span className="inline-flex items-center gap-1">
          {[0, 160, 320].map((delay) => (
            <span
              key={delay}
              className="inline-block h-2 w-2 animate-typing-bounce rounded-full"
              style={{ background: accent, animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
          사진 그리는 중
        </span>
      </div>
    </div>
  );
}

function ProductCardView({
  product,
  accent,
  from,
}: {
  product: ProductPayload;
  accent: string;
  from: string;
}) {
  return (
    <div className="w-full max-w-[300px] overflow-hidden rounded-2xl bg-white shadow-md">
      <div className="flex items-center justify-between px-4 pt-3">
        <Chip variant="outline">{from}&rsquo;s pick</Chip>
        <span className="font-mono text-[9px] uppercase tracking-eyebrow text-brand-ink-soft">
          Ad
        </span>
      </div>
      <div className="mt-2 aspect-[16/9] w-full overflow-hidden bg-brand-paper-deep">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.title}
          className="block h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
      <div className="space-y-1.5 px-4 py-3">
        <div className="font-display text-lg leading-tight tracking-tight text-brand-ink">
          {product.title}
        </div>
        <div className="font-sans text-base font-semibold" style={{ color: accent }}>
          {product.price.toLocaleString('ko-KR')}원
        </div>
        <a
          href={product.ctaUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 block rounded-full py-2 text-center font-sans text-[13px] font-medium text-white transition"
          style={{ background: accent }}
        >
          지금 보기 →
        </a>
      </div>
    </div>
  );
}
