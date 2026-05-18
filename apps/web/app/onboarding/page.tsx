'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button, Eyebrow, Wordmark } from '@wi/ui/web';

import HeaderNav from '@/components/HeaderNav';
import { getBrowserSupabase } from '@/lib/supabase/browser';

import {
  getDongsForSgg,
  getSggsForProvince,
  PROVINCES,
  type DongChoice,
  type SggChoice,
} from './regions';

/**
 * Onboarding form — single scrolling page, four sections:
 *
 *   1. Nickname (required) — used by all four characters.
 *   2. Location (optional) — 3-level cascading dropdown
 *      시/도 → 시군구 → 동. Each level filters the next.
 *      PC users get the full drill-down precision; mobile users
 *      will eventually skip this in favour of GPS (deferred).
 *      Selecting only 시/도+시군구 (no 동) is OK — we save the
 *      구 centroid as the location, which is plenty accurate for
 *      weather grids.
 *   3. Birth year (optional).
 *   4. Gender (optional).
 *
 * The 3rd dropdown is *adaptive*: if the picked 구 doesn't have
 * any curated 동 entries (most rural counties), the 동 select
 * collapses entirely instead of showing an empty list — avoids a
 * dead UI element.
 */
type Gender = 'female' | 'male' | 'nonbinary' | 'prefer_not';

interface LocationPick {
  lat: number;
  lng: number;
  label: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 100;
const MAX_YEAR = CURRENT_YEAR - 7;

export default function OnboardingPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<string>('');
  const [gender, setGender] = useState<Gender | null>(null);

  // Cascading region state. Each level is independent so the user
  // can re-pick higher tiers without losing lower-tier defaults.
  const [provinceCode, setProvinceCode] = useState<string>('');
  const [sggCode, setSggCode] = useState<string>('');
  const [dongId, setDongId] = useState<string>('');

  // Three legally-required consents bundled into a single state
  // toggle. The UI shows three labelled checkboxes with view-document
  // links, but they're either all-on or all-off so the user can't
  // partially accept (the documents reference each other and can't
  // function independently). The actual timestamp + version is set
  // server-side at /api/me/onboarding submission time.
  const [agreed, setAgreed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived data — recomputed only when the parent select changes.
  const sggOptions = useMemo<SggChoice[]>(
    () => (provinceCode ? getSggsForProvince(provinceCode) : []),
    [provinceCode],
  );
  const dongOptions = useMemo<DongChoice[]>(
    () => (sggCode ? getDongsForSgg(sggCode) : []),
    [sggCode],
  );

  // Effective location: 동 wins, then 구, then nothing.
  const location = useMemo<LocationPick | null>(() => {
    if (dongId) {
      const d = dongOptions.find((x) => x.id === dongId);
      if (d) return { lat: d.lat, lng: d.lng, label: d.fullLabel };
    }
    if (sggCode) {
      const s = sggOptions.find((x) => x.code === sggCode);
      if (s) return { lat: s.lat, lng: s.lng, label: s.fullLabel };
    }
    return null;
  }, [dongId, sggCode, sggOptions, dongOptions]);

  useEffect(() => {
    const existing = localStorage.getItem('wi.nickname');
    if (existing) setNickname(existing);
  }, []);

  // Reset the dependent selects whenever the parent changes — so
  // picking a new 시/도 doesn't leave a stale 시군구/동 hanging.
  function onProvinceChange(code: string) {
    setProvinceCode(code);
    setSggCode('');
    setDongId('');
  }
  function onSggChange(code: string) {
    setSggCode(code);
    setDongId('');
  }

  async function complete() {
    const nick = nickname.trim();
    if (!nick) return;
    if (!agreed) {
      // Belt-and-suspenders — the submit button is also disabled
      // when this is false, but a determined user could trigger the
      // form via Enter on the nickname field. Refuse server-side
      // submission too (server validates `termsAccepted: true` in
      // /api/me/onboarding).
      setError('이용약관·개인정보처리방침·저작권 정책에 동의해주세요.');
      return;
    }

    setSubmitting(true);
    setError(null);

    localStorage.setItem('wi.nickname', nick);
    localStorage.setItem('wi.onboarded', '1');
    if (location) {
      localStorage.setItem(
        'wi.location',
        JSON.stringify({ lat: location.lat, lng: location.lng, label: location.label }),
      );
    }

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
            // Bundled consent — server stamps profiles.terms_accepted_at
            // + terms_version. Must be true at this point because the
            // client-side gate above blocks submission otherwise; we
            // still send it explicitly so the server can verify and
            // also re-confirm with the current LEGAL.version string.
            termsAccepted: true,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          console.warn('[onboarding] save failed', j.error?.message);
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

        {/* ── 1. Nickname ─────────────────────────────────────────── */}
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

        {/* ── 2. Location — 3-level cascading dropdown ───────────── */}
        <section className="mt-10 flex flex-col gap-3">
          <label className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            ② 위치 · Location (선택, 동네 날씨에 맞춰 대화해요)
          </label>
          <p className="font-sans text-[12px] text-brand-ink-soft">
            시/도 → 시·군·구 → 동까지 선택. 동이 없는 지역은 시·군·구까지만 골라도 OK.
            <br />
            <span className="text-brand-ink-soft/70">
              모바일에서는 추후 GPS로 자동 인식 지원 예정.
            </span>
          </p>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {/* 시/도 */}
            <select
              value={provinceCode}
              onChange={(e) => onProvinceChange(e.target.value)}
              className="h-12 appearance-none rounded-full border border-brand-ink/15 bg-white px-4 font-sans text-[14px] text-brand-ink outline-none transition focus:border-brand-ink/30"
            >
              <option value="">시/도 선택</option>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>

            {/* 시·군·구 — only enabled when a province is chosen */}
            <select
              value={sggCode}
              onChange={(e) => onSggChange(e.target.value)}
              disabled={!provinceCode}
              className="h-12 appearance-none rounded-full border border-brand-ink/15 bg-white px-4 font-sans text-[14px] text-brand-ink outline-none transition focus:border-brand-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">시·군·구 선택</option>
              {sggOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* 동 — disabled if no 동 data for this 구 */}
            <select
              value={dongId}
              onChange={(e) => setDongId(e.target.value)}
              disabled={!sggCode || dongOptions.length === 0}
              className="h-12 appearance-none rounded-full border border-brand-ink/15 bg-white px-4 font-sans text-[14px] text-brand-ink outline-none transition focus:border-brand-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                sggCode && dongOptions.length === 0
                  ? '이 지역은 동 데이터가 아직 없어요'
                  : undefined
              }
            >
              <option value="">
                {sggCode && dongOptions.length === 0 ? '동 데이터 없음' : '동 선택 (선택)'}
              </option>
              {dongOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {location ? (
            <p className="font-sans text-[12px] text-brand-ink-soft">
              선택됨: <span className="text-brand-ink">{location.label}</span>
            </p>
          ) : null}
        </section>

        {/* ── 3. Birth year ───────────────────────────────────────── */}
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

        {/* ── 4. Gender ───────────────────────────────────────────── */}
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

        {/* ── 5. Legal consent ────────────────────────────────────
            Three documents bundled into a single checkbox — the
            documents are interdependent (저작권 정책 refers to
            이용약관, 처리방침 sits inside both) so partial consent
            doesn't make legal sense. The "필수" suffix mirrors
            Korean app convention where multi-checkbox consent
            sections label each item 필수/선택. */}
        <section className="mt-10 flex flex-col gap-3">
          <label className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            ⑤ 약관 동의 (필수)
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
              agreed
                ? 'border-brand-accent bg-brand-accent/5'
                : 'border-brand-ink/15 bg-white hover:border-brand-ink/30'
            }`}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-brand-accent"
              aria-label="이용약관 · 개인정보처리방침 · 저작권 정책에 동의"
            />
            <div className="flex-1">
              <p className="font-sans text-[14px] font-medium text-brand-ink">
                <span className="text-red-600">[필수]</span> 만 14세 이상이며,
                아래 약관에 모두 동의합니다.
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[12px] text-brand-ink-soft">
                <Link
                  href="/terms"
                  target="_blank"
                  className="underline underline-offset-2 hover:text-brand-ink"
                >
                  이용약관 보기 ↗
                </Link>
                <span className="text-brand-ink/15">·</span>
                <Link
                  href="/privacy"
                  target="_blank"
                  className="underline underline-offset-2 hover:text-brand-ink"
                >
                  개인정보처리방침 보기 ↗
                </Link>
                <span className="text-brand-ink/15">·</span>
                <Link
                  href="/copyright"
                  target="_blank"
                  className="underline underline-offset-2 hover:text-brand-ink"
                >
                  저작권 정책 보기 ↗
                </Link>
              </p>
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-brand-ink-soft">
                저작권 정책 요약: 생성되는 모든 콘텐츠의 저작권은 케이웨더(주)에
                귀속됩니다. 단 회원은 자신이 받은 파일을 보유하고 비영리
                목적으로 게시·공유할 수 있습니다.
              </p>
            </div>
          </label>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-300/40 bg-red-50/50 px-4 py-3 font-sans text-[13px] text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-12 flex flex-col gap-3 md:flex-row md:items-center">
          <Button
            variant="accent"
            size="lg"
            onClick={complete}
            disabled={!nickname.trim() || !agreed || submitting}
          >
            {submitting ? '저장 중…' : '시작하기 →'}
          </Button>
          <span className="font-sans text-[13px] text-brand-ink-soft">
            닉네임 입력 + 약관 동의 후 진행 가능
          </span>
        </div>
      </div>

      <footer className="mx-auto w-full max-w-3xl px-8 py-6 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
        © 2026 Weather Idols · Prism Station
      </footer>
    </main>
  );
}
