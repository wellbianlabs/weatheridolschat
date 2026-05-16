'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { Character } from '@wi/core/characters';
import type { ProductPayload } from '@wi/core/chat';
import { kstDateString } from '@wi/core/time';
import type { WeatherSnapshot } from '@wi/core/weather';
import { Button, Chip, Eyebrow } from '@wi/ui/web';

import WeatherBackground from '@/components/WeatherBackground';

type MessageKind = 'text' | 'image' | 'product';
interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: MessageKind;
  content?: string;
  imageUrl?: string;
  product?: ProductPayload;
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
  { id: 'recommend', label: '추천해줘', text: '오늘 뭐 추천해줄래?' },
  { id: 'song', label: '오늘의 노래', text: '오늘 어울리는 노래 추천해줘' },
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
