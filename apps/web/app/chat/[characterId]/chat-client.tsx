'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Character } from '@wi/core/characters';
import type { ProductPayload } from '@wi/core/chat';
import { kstDateString } from '@wi/core/time';
import type { WeatherSnapshot } from '@wi/core/weather';
import { Button, Chip, Eyebrow } from '@wi/ui/web';

import WeatherBackground from '@/components/WeatherBackground';

type MessageKind = 'text' | 'image' | 'product' | 'music';
interface MusicTrack {
  taskId: string;
  title?: string;
  audioUrl?: string;
  lyrics?: string;
  status: 'queued' | 'streaming' | 'done' | 'failed';
  error?: string;
  /** Epoch ms when the task started (POST /api/music returned). Used to
   *  drive the progress bar — Suno doesn't expose a real percentage. */
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
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [usage, setUsage] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  // Per-song AbortControllers so the "취소" button on the music card can
  // stop the polling loop without affecting other in-flight songs.
  const songAbortersRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    setNickname(localStorage.getItem('wi.nickname') ?? '친구');
    const prior = loadHistory(character.id);
    if (prior && prior.length > 0) setMessages(prior);
    setUsage(getTodayCount());
  }, [character.id]);

  useEffect(() => {
    saveHistory(character.id, messages);
  }, [character.id, messages]);

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

    updateMusic({ status: 'queued', pollCount: 0 }, true);

    // ── Kickoff ─────────────────────────────────────────────────────
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
        updateMusic({ status: 'failed', error: truncate(reason, 140) }, false);
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
    if (!text || sending) return;
    if (getTodayCount() >= MAX_FREE_MESSAGES) {
      setPaywallOpen(true);
      return;
    }
    setInput('');
    setSending(true);
    lastUserMessageRef.current = text;

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', kind: 'text', content: text },
      { id: assistantId, role: 'assistant', kind: 'text', content: '', pending: true },
    ]);

    let imageIntentTriggered = false;
    let songIntentTriggered = false;
    let productCard: ProductPayload | null = null;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id, text, nickname }),
      });
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
            <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
              {Number.isFinite(MAX_FREE_MESSAGES) ? `${usage}/${MAX_FREE_MESSAGES}` : `오늘 ${usage}회`}
            </span>
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

          <form
            className="flex items-center gap-2 px-6 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input.trim());
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지를 입력하세요…"
              disabled={sending}
              className="h-11 flex-1 rounded-full border border-brand-ink/12 bg-white px-5 font-sans text-[15px] text-brand-ink outline-none transition focus:border-brand-ink/40"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
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

        {paywallOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 p-4 md:items-center">
            <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
              <Eyebrow>★ Premium</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-brand-ink">
                {character.displayName}와 더 깊게 이야기하기.
              </h2>
              <p className="mt-3 font-sans text-[15px] leading-relaxed text-brand-ink-soft">
                오늘 무료 메시지를 모두 사용했어요. 프리미엄으로 무제한 대화와 깊이 있는 모델로 이어가요.
              </p>
              <ul className="mt-4 space-y-2 font-sans text-sm text-brand-ink-soft">
                <li>· 메시지 무제한 (30 → ∞)</li>
                <li>· 깊이 있는 Claude 모델</li>
                <li>· 이미지 50/일, 장기 기억, 광고 제거</li>
              </ul>
              <div className="mt-6 flex gap-2">
                <Button variant="secondary" size="md" fullWidth onClick={() => setPaywallOpen(false)}>
                  다음에
                </Button>
                <Button
                  variant="accent"
                  size="md"
                  fullWidth
                  accentColor={character.accentColor}
                  onClick={() => {
                    localStorage.setItem('wi.waitlist', '1');
                    setPaywallOpen(false);
                  }}
                >
                  관심 등록
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </WeatherBackground>
  );
}

function ChatBubble({
  message,
  accentColor,
  onRegenerate,
}: {
  message: UIMessage;
  accentColor: string;
  onRegenerate: () => void;
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
  return (
    <div
      className="max-w-[80%] cursor-pointer rounded-2xl bg-white px-4 py-2.5 font-sans text-[15px] leading-relaxed text-brand-ink shadow-xs"
      onClick={() => message.content && setOpen((v) => !v)}
    >
      {message.pending && !message.content ? (
        <TypingDots accent={accentColor} />
      ) : (
        <>
          {message.content || ' '}
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
        <div className="mt-2 flex gap-4 border-t border-brand-ink/10 pt-2">
          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(message.content ?? '');
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
  const isActive = track.active && (track.status === 'queued' || track.status === 'streaming');
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

  // Synthetic progress bar percentage.
  //   queued: 0 → 60% over 30s
  //   streaming: 60 → 95% over the next 30s
  //   done: 100% instantly
  //   failed: keep last value (bar fades to ink-soft)
  let pct = 0;
  if (track.status === 'done') pct = 100;
  else if (track.status === 'failed') pct = Math.min(95, (elapsedSec / 30) * 60);
  else if (track.status === 'queued') pct = Math.min(60, (elapsedSec / 30) * 60);
  else if (track.status === 'streaming')
    pct = Math.min(95, 60 + ((elapsedSec - 30) / 30) * 35);

  let statusCopy = '';
  if (track.status === 'queued') statusCopy = '작사하는 중';
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

        {track.status === 'done' && track.audioUrl ? (
          <div className="space-y-3 pt-1">
            <AudioPlayer
              src={track.audioUrl}
              accent={accent}
              downloadHref={downloadHref}
              downloadName={`${downloadName}.mp3`}
            />
            {track.lyrics ? <LyricsView lyrics={track.lyrics} accent={accent} /> : null}
          </div>
        ) : track.status === 'failed' ? (
          <p className="font-sans text-[13px] leading-relaxed text-brand-ink-soft">
            노래를 만들지 못했어. {track.error ? `(${track.error})` : ''}
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

  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        가사
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl bg-brand-paper px-3.5 py-3">
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
 * Three-dot typing indicator. Each dot bounces on the same keyframes but is
 * offset by a 160ms stagger so the wave reads as a single travelling pulse.
 * Tinted to the character's accent color so it feels like *that* character
 * is thinking, not a generic system spinner.
 */
function TypingDots({ accent }: { accent: string }) {
  return (
    <span className="inline-flex items-center gap-1 py-[3px]" aria-label="응답 생성 중">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="inline-block h-1.5 w-1.5 animate-typing-bounce rounded-full"
          style={{ background: accent, animationDelay: `${delay}ms` }}
        />
      ))}
      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        생성 중
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
