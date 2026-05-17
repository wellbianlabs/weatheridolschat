import Link from 'next/link';

import { CHARACTER_LIST } from '@wi/core/characters';
import { Button, Card, Chip, Eyebrow } from '@wi/ui/web';

import HeaderNav from '@/components/HeaderNav';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-brand-paper">
      {/* HERO — full-bleed photo on the right, copy in the left cream zone */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          backgroundImage: "url('/hero.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="relative aspect-[16/9] min-h-[640px] w-full">
          {/* Strong opaque cream wash on the left — fully covers the photo's
              embedded "Weather idols" logo zone, then fades out cleanly. */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-[55%] md:w-[48%]"
            style={{
              background:
                'linear-gradient(90deg, #FFFAF3 0%, #FFFAF3 55%, rgba(255,250,243,0.85) 78%, rgba(255,250,243,0) 100%)',
            }}
          />
          {/* Bottom fade for clean transition into the next section. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[28%]"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,250,243,0) 0%, rgba(255,250,243,0.7) 70%, #FFFAF3 100%)',
            }}
          />

          {/* Top nav — login-state aware. Renders the same shape on
              every public page so users always know where to sign in. */}
          <HeaderNav variant="transparent" />

          {/* Hero copy — constrained to the left cream column. */}
          <div className="relative z-10 mx-auto flex h-full max-w-6xl items-center px-8">
            <div className="w-full max-w-[360px] md:max-w-[400px]">
              <Eyebrow>★ Weather Idols · Vol. 01 · 2026</Eyebrow>
              <h1 className="mt-5 font-display text-[36px] font-medium leading-[1.05] tracking-tight text-brand-ink md:text-[44px]">
                오늘의 날씨,
                <br />
                오늘의 대화.
              </h1>
              <p className="mt-5 max-w-[320px] font-sans text-[14px] leading-relaxed text-brand-ink-soft md:max-w-[360px] md:text-[15px]">
                초국지적 기상 데이터와 멀티모달 AI가 결합된, 4인 아이돌과의
                라이프스타일 컴패니언.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Link href="/onboarding">
                  <Button variant="accent" size="md">
                    시작하기 →
                  </Button>
                </Link>
                <Link href="/characters">
                  <Button variant="secondary" size="md">
                    캐릭터 둘러보기
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
                <span>Free · 30 / day</span>
                <span className="text-brand-ink/20">/</span>
                <span>Premium · Unlimited</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />

      <section className="mx-auto max-w-6xl px-8 py-20">
        <div className="mb-12 flex items-end justify-between gap-6">
          <div>
            <Eyebrow>★ The Roster</Eyebrow>
            <h2 className="mt-3 font-display text-[44px] font-medium leading-tight tracking-tight text-brand-ink md:text-[56px]">
              네 명, 네 가지 날씨.
            </h2>
          </div>
          <Link
            href="/characters"
            className="hidden shrink-0 font-sans text-sm text-brand-ink-soft underline underline-offset-4 hover:text-brand-ink md:inline"
          >
            전체 보기 →
          </Link>
        </div>

        <ul className="grid gap-6 md:grid-cols-2">
          {CHARACTER_LIST.map((c, idx) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="group block">
                <Card variant="elevated" className="overflow-hidden p-0 transition hover:shadow-md">
                  <div
                    className="relative aspect-[16/9] w-full overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${c.accentColor}22 0%, ${c.accentColor}0d 60%, #FFFAF3 100%)`,
                    }}
                  >
                    {c.rosterImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.rosterImageUrl}
                        alt={`${c.displayNameEn} roster`}
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : null}
                    <div
                      className="pointer-events-none absolute left-4 top-4 font-display text-[28px] font-medium leading-none text-white drop-shadow-md"
                      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                  </div>
                  <div className="space-y-3 p-6">
                    <Eyebrow>
                      {c.displayNameEn} · {c.originRegion}
                    </Eyebrow>
                    <span
                      className="block font-display text-4xl font-medium tracking-tight"
                      style={{ color: c.accentColor }}
                    >
                      {c.displayName}
                    </span>
                    <p className="font-sans text-[15px] leading-relaxed text-brand-ink-soft">
                      {c.shortBio}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {c.recommendationDomains.slice(0, 3).map((d) => (
                        <Chip key={d} variant="outline">
                          {d}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />

      {/* ─── DAILY MOODS ─── */}
      <section className="mx-auto max-w-6xl px-8 py-24">
        <div className="grid items-end gap-10 md:grid-cols-[1fr_1.1fr]">
          <div>
            <Eyebrow>★ Every Day, A New Mood</Eyebrow>
            <h2 className="mt-3 font-display text-[44px] font-medium leading-tight tracking-tight text-brand-ink md:text-[56px]">
              매일이 다른,
              <br />
              너만의 무드.
            </h2>
          </div>
          <p className="font-sans text-[16px] leading-relaxed text-brand-ink-soft md:max-w-md md:justify-self-end md:text-right">
            정보가 아닌 감성으로. 오늘의 비에 어울리는 한 곡, 햇살에 맞는 코디,
            너에게만 도착하는 한 장의 컷. 매일 다른 무드가 도착해요.
          </p>
        </div>

        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          <DailyMoodCard
            kind="song"
            label="오늘의 노래"
            sub="A song for today's weather"
            character={CHARACTER_LIST[1]!}
            preview="비 오는 가나자와의 피아노."
          />
          <DailyMoodCard
            kind="outfit"
            label="오늘의 코디"
            sub="An outfit for today's mood"
            character={CHARACTER_LIST[0]!}
            preview="해운대 산책, 오버사이즈 셔츠 + 화이트 스커트."
          />
          <DailyMoodCard
            kind="cut"
            label="오늘의 컷"
            sub="A frame just for you"
            character={CHARACTER_LIST[2]!}
            preview="안개 낀 호반에서, 너에게만 보내는 사진."
          />
        </ul>
      </section>

      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />

      {/* ─── COLLECTION (POLAROIDS) ─── */}
      <section className="mx-auto max-w-6xl px-8 py-24">
        <div className="grid items-start gap-10 md:grid-cols-[1fr_1.1fr]">
          <div>
            <Eyebrow>★ Your Archive</Eyebrow>
            <h2 className="mt-3 font-display text-[44px] font-medium leading-tight tracking-tight text-brand-ink md:text-[56px]">
              하루씩 쌓이는,
              <br />
              너만의 아이돌.
            </h2>
            <p className="mt-5 max-w-md font-sans text-[16px] leading-relaxed text-brand-ink-soft">
              스쳐 보내는 대화가 아니라, 모이는 컬렉션. 오늘의 컷·오늘의 노래·오늘의 한 마디가
              너의 폴라로이드 벽에 차곡차곡 쌓여요.
            </p>
            <div className="mt-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
              <span>03 · 19 · 토요일</span>
              <span className="text-brand-ink/20">/</span>
              <span>17:42 KST</span>
            </div>
          </div>

          <div className="relative h-[460px]">
            {CHARACTER_LIST.map((c, i) => {
              const layout = [
                { top: '4%', left: '8%', rotate: -7, label: 'Sat · 비 오는 오후' },
                { top: '2%', right: '6%', rotate: 5, label: 'Wed · 햇살 28°C' },
                { top: '46%', left: '2%', rotate: 6, label: 'Fri · 안개의 새벽' },
                { top: '48%', right: '14%', rotate: -5, label: 'Sun · 천둥의 밤' },
              ];
              const p = layout[i] ?? layout[0]!;
              return (
                <Polaroid
                  key={c.id}
                  src={c.referenceImageUrl ?? c.rosterImageUrl ?? ''}
                  alt={c.displayNameEn}
                  caption={c.displayName}
                  meta={p.label}
                  accent={c.accentColor}
                  style={{
                    position: 'absolute',
                    top: p.top,
                    left: p.left,
                    right: p.right,
                    transform: `rotate(${p.rotate}deg)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />

      {/* ─── SOFT POETIC CTA ─── */}
      <section className="mx-auto max-w-3xl px-8 py-32 text-center">
        <Eyebrow className="mx-auto">★ Today&rsquo;s mood</Eyebrow>
        <h2 className="mt-5 font-display text-[44px] font-medium leading-[1.1] tracking-tight text-brand-ink md:text-[64px]">
          오늘은,
          <br />
          어떤 무드?
        </h2>
        <p className="mx-auto mt-6 max-w-md font-sans text-[17px] leading-relaxed text-brand-ink-soft">
          무엇이든 괜찮아요. 닉네임 하나면, 4명 중 한 명이 오늘의 한 곡을 보내요.
        </p>
        <div className="mt-10 flex justify-center">
          <Link href="/onboarding">
            <Button variant="accent" size="lg">
              오늘의 한 곡 받기 →
            </Button>
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl border-t border-brand-ink/10 px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
          <span>© 2026 Weather Idols · Prism Station</span>
          <div className="flex gap-6">
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION HELPERS
// ──────────────────────────────────────────────────────────────────────────

type DailyKind = 'song' | 'outfit' | 'cut';

function DailyMoodCard({
  kind,
  label,
  sub,
  character,
  preview,
}: {
  kind: DailyKind;
  label: string;
  sub: string;
  character: (typeof CHARACTER_LIST)[number];
  preview: string;
}) {
  const accent = character.accentColor;
  return (
    <li>
      <Card variant="elevated" className="h-full overflow-hidden p-0">
        <div
          className="relative aspect-[4/5] w-full overflow-hidden"
          style={{
            background: `linear-gradient(180deg, ${accent}30 0%, ${accent}10 60%, #FFFAF3 100%)`,
          }}
        >
          {/* Visual centerpiece per kind */}
          <div className="absolute inset-0 flex items-center justify-center">
            <DailyMoodVisual kind={kind} accent={accent} />
          </div>
          {/* Eyebrow chip */}
          <div className="absolute left-5 top-5">
            <Chip variant="ink">{sub}</Chip>
          </div>
          {/* Character badge */}
          <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 backdrop-blur">
            <span
              className="h-5 w-5 rounded-full text-center font-display text-[10px] leading-5 text-white"
              style={{ background: accent }}
            >
              {character.displayNameEn.charAt(0)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
              {character.displayNameEn}
            </span>
          </div>
        </div>
        <div className="space-y-2 p-6">
          <h3
            className="font-display text-3xl font-medium tracking-tight"
            style={{ color: accent }}
          >
            {label}
          </h3>
          <p className="font-sans text-[14px] leading-relaxed text-brand-ink-soft">{preview}</p>
        </div>
      </Card>
    </li>
  );
}

function DailyMoodVisual({ kind, accent }: { kind: DailyKind; accent: string }) {
  if (kind === 'song') {
    return (
      <div className="relative flex h-44 w-44 items-center justify-center">
        {/* Vinyl record */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'repeating-radial-gradient(circle, #241B3E 0px, #241B3E 1px, #3a3055 1px, #3a3055 3px)',
          }}
        />
        <div
          className="absolute inset-6 rounded-full"
          style={{ background: accent }}
        />
        <div className="absolute h-3 w-3 rounded-full bg-brand-paper" />
      </div>
    );
  }
  if (kind === 'outfit') {
    return (
      <svg viewBox="0 0 160 160" className="h-44 w-44" aria-hidden>
        <path
          d="M40 50 L80 30 L120 50 L130 70 L110 80 L110 140 L50 140 L50 80 L30 70 Z"
          fill={`${accent}33`}
          stroke={accent}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="80" cy="34" r="6" fill="none" stroke={accent} strokeWidth="2" />
        <line x1="80" y1="40" x2="80" y2="50" stroke={accent} strokeWidth="2" />
      </svg>
    );
  }
  // cut — polaroid camera frame
  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44" aria-hidden>
      <rect
        x="28"
        y="44"
        width="104"
        height="92"
        rx="6"
        fill="white"
        stroke={accent}
        strokeWidth="2.5"
      />
      <rect x="38" y="54" width="84" height="60" rx="3" fill={`${accent}33`} />
      <circle cx="80" cy="84" r="14" fill="none" stroke={accent} strokeWidth="2.5" />
      <circle cx="80" cy="84" r="6" fill={accent} />
      <circle cx="112" cy="60" r="3" fill={accent} />
    </svg>
  );
}

function Polaroid({
  src,
  alt,
  caption,
  meta,
  accent,
  style,
}: {
  src: string;
  alt: string;
  caption: string;
  meta: string;
  accent: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="w-44 rounded-md bg-white p-3 shadow-md transition hover:-translate-y-1 hover:shadow-lg"
      style={style}
    >
      <div
        className="aspect-square w-full overflow-hidden rounded-sm"
        style={{ background: `${accent}1a` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="block h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="mt-3 flex flex-col items-center gap-1 pb-2">
        <span
          className="font-display text-xl font-medium leading-none tracking-tight"
          style={{ color: accent }}
        >
          {caption}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
          {meta}
        </span>
      </div>
    </div>
  );
}
