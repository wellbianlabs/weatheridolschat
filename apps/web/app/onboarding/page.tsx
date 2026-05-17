'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button, Eyebrow, Wordmark } from '@wi/ui/web';

import HeaderNav from '@/components/HeaderNav';
import { getBrowserSupabase } from '@/lib/supabase/browser';

import { KR_CITIES } from './cities';

/**
 * Onboarding form — single scrolling page, four sections:
 *
 *   1. Nickname (required) — used by all four characters when
 *      addressing the user.
 *   2. Location (optional) — 16-city dropdown of Korean cities.
 *      We intentionally do NOT use browser geolocation here:
 *      - permission prompt adds friction on first run
 *      - coords alone don't give a human-readable city label
 *      - mobile / VPN / corporate-WiFi often returns wrong coords
 *      - the user typically knows their own city better than the
 *        browser's geolocation guess
 *      A 16-pick dropdown covers >90% of the Korean population
 *      footprint and gives the LLM a clear "위치: 부산 해운대구"
 *      line in the [Now Context] block.
 *   3. Birth year (optional) — single 4-digit input. We don't need
 *      day precision for age-cohort decisions and asking for it
 *      feels intrusive.
 *   4. Gender (optional) — 4 chip choices matching the `gender`
 *      check constraint in profiles. "밝히지 않음" is a real value,
 *      not a skip — the difference matters for product analytics
 *      (skip = no data vs. prefer_not = explicit private choice).
 *
 * Auth flow:
 *   - Signed-in users: payload persisted via POST /api/me/onboarding
 *     (server upserts profile via service-role client + sets
 *     onboarded_at). Always keeps localStorage in sync so the rest
 *     of the app can read instantly without a round-trip.
 *   - Anonymous users: localStorage only. The data is lost if they
 *     never sign up, which is the right trade — we don't want to
 *     orphan profile rows for visitors who never converted.
 *
 * UX rules:
 *   - Nickname is the only required field. Everything else can be
 *     left blank and the form still submits.
 *   - Enter on the nickname input submits the form (low-friction
 *     for users who don't want to fill the optional sections).
 */
type Gender = 'female' | 'male' | 'nonbinary' | 'prefer_not';

interface LocationPick {
  lat: number;
  lng: number;
  label: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 100;
const MAX_YEAR = CURRENT_YEAR - 7; // soft floor — under-7 is implausible for this product

export default function OnboardingPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<string>('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [location, setLocation] = useState<LocationPick | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from localStorage so a returning user doesn't have to
  // re-type their nickname. The DB is the source of truth when
  // signed in, but the page loads before the auth round-trip
  // completes, so we use localStorage as the warm-start cache.
  useEffect(() => {
    const existing = localStorage.getItem('wi.nickname');
    if (existing) setNickname(existing);
  }, []);

  function pickCity(cityId: string) {
    if (!cityId) {
      setLocation(null);
      return;
    }
    const city = KR_CITIES.find((c) => c.id === cityId);
    if (!city) return;
    setLocation({ lat: city.lat, lng: city.lng, label: city.label });
  }

  async function complete() {
    const nick = nickname.trim();
    if (!nick) return;

    setSubmitting(true);
    setError(null);

    // Always cache locally — the chat client + characters page read
    // the nickname from localStorage for instant render.
    localStorage.setItem('wi.nickname', nick);
    localStorage.setItem('wi.onboarded', '1');
    if (location) {
      localStorage.setItem(
        'wi.location',
        JSON.stringify({ lat: location.lat, lng: location.lng, label: location.label }),
      );
    }

    // Persist server-side if signed in. We don't fail the form when
    // the persistence fails — local data is enough for the app to
    // run; the user can re-save from /account later.
    try {
      const supabase = getBrowserSupabase();
      const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
      if (data.user) {
        const yearN = Number.parseInt(birthYear, 10);
        const validYear =
          Number.isFinite(yearN) && yearN >= MIN_YEAR && yearN <= MAX_YEAR ? yearN : null;
        const res = await fetch('/api/me/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            nickname: nick,
            birthYear: validYear,
            gender,
            location: location
              ? { lat: location.lat, lng: location.lng, label: location.label }
              : null,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          console.warn('[onboarding] save failed', j.error?.message);
          // Non-fatal — surface a soft warning but proceed to /characters.
        }
      }
    } catch (err) {
      console.warn('[onboarding] save threw', (err as Error).message);
    }

    setSubmitting(false);
    router.push('/characters');
  }

  return (
    <main className="bg-dreamy-vertical flex min-h-screen flex-col">
      <HeaderNav />

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-8 pb-24 pt-10">
        <Wordmark size="md" />

        <h1 className="mt-10 font-display text-[44px] font-medium leading-[1.1] tracking-tightest text-brand-ink md:text-[56px]">
          처음 만나는
          <br />
          몇 가지 질문.
        </h1>

        <p className="mt-5 max-w-md font-sans text-[16px] leading-relaxed text-brand-ink-soft">
          아이돌들이 너에게 맞는 답을 하려면 조금 알아야 해요. 닉네임만 필수, 나머지는
          모두 건너뛸 수 있고 언제든 바꿀 수 있어요.
        </p>

        {/* ── 1. Nickname (required) ─────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-3">
          <label className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            ① 닉네임 · Nickname (필수)
          </label>
          <input
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 웨더보이"
            maxLength={20}
            className="w-full border-b-2 border-brand-ink/15 bg-transparent pb-3 font-display text-3xl font-medium text-brand-ink outline-none transition focus:border-brand-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nickname.trim()) complete();
            }}
          />
        </section>

        {/* ── 2. Location (optional, dropdown only) ──────────────── */}
        {/* 16-city dropdown — see the file-header JSDoc for why we
            deliberately skip browser geolocation here. The user
            knows their own city; a single select is the lowest-
            friction control to capture it. */}
        <section className="mt-10 flex flex-col gap-3">
          <label className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            ② 위치 · Location (선택, 동네 날씨에 맞춰 대화해요)
          </label>
          <select
            value={
              location
                ? (KR_CITIES.find(
                    (c) => c.lat === location.lat && c.lng === location.lng,
                  )?.id ?? '')
                : ''
            }
            onChange={(e) => pickCity(e.target.value)}
            className="h-12 w-full appearance-none rounded-full border border-brand-ink/15 bg-white px-5 font-sans text-[15px] text-brand-ink outline-none transition focus:border-brand-ink/30"
          >
            <option value="">선택 안 함 (기본: 서울 강남구)</option>
            {KR_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {location ? (
            <p className="font-sans text-[12px] text-brand-ink-soft">
              선택됨: <span className="text-brand-ink">{location.label}</span>
            </p>
          ) : null}
        </section>

        {/* ── 3. Birth year (optional) ──────────────────────────── */}
        <section className="mt-10 flex flex-col gap-3">
          <label className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            ③ 태어난 해 · Birth Year (선택)
          </label>
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="예: 1995"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full border-b-2 border-brand-ink/15 bg-transparent pb-3 font-display text-2xl font-medium text-brand-ink outline-none transition focus:border-brand-accent"
          />
          <p className="font-sans text-[12px] text-brand-ink-soft">
            나이대에 맞는 톤으로 대화해요. 정확한 생일까지는 묻지 않아요.
          </p>
        </section>

        {/* ── 4. Gender (optional) ──────────────────────────────── */}
        <section className="mt-10 flex flex-col gap-3">
          <label className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            ④ 성별 · Gender (선택)
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: 'female', label: '여성' },
                { v: 'male', label: '남성' },
                { v: 'nonbinary', label: '논바이너리' },
                { v: 'prefer_not', label: '밝히지 않음' },
              ] as { v: Gender; label: string }[]
            ).map((g) => (
              <button
                key={g.v}
                type="button"
                onClick={() => setGender(gender === g.v ? null : g.v)}
                className={
                  gender === g.v
                    ? 'rounded-full bg-brand-accent px-5 py-2.5 font-sans text-[14px] font-medium text-white shadow-xs transition'
                    : 'rounded-full border border-brand-ink/15 bg-white px-5 py-2.5 font-sans text-[14px] text-brand-ink transition hover:border-brand-ink/30'
                }
              >
                {g.label}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-300/40 bg-red-50/50 px-4 py-3 font-sans text-[13px] text-red-700">
            {error}
          </div>
        ) : null}

        {/* ── Submit ─────────────────────────────────────────────── */}
        <div className="mt-12 flex flex-col gap-3 md:flex-row md:items-center">
          <Button
            variant="accent"
            size="lg"
            onClick={complete}
            disabled={!nickname.trim() || submitting}
          >
            {submitting ? '저장 중…' : '시작하기 →'}
          </Button>
          <span className="font-sans text-[13px] text-brand-ink-soft">
            닉네임만 입력해도 진행 가능해요
          </span>
        </div>
      </div>

      <footer className="mx-auto w-full max-w-3xl px-8 py-6 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
        © 2026 Weather Idols · Prism Station
      </footer>
    </main>
  );
}
