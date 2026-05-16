import Link from 'next/link';

import { PLANS, PRICING } from '@wi/core/monetization';
import { Eyebrow } from '@wi/ui/web';

import WaitlistButton from './waitlist-button';

export const dynamic = 'force-dynamic';

/**
 * Pricing landing page.
 *
 * Phase 3 stub — shows the planned tier breakdown + "waitlist" CTA.
 * Phase 4 (Toss Payments wiring) replaces the waitlist with real
 * "Subscribe" buttons that initiate a payment session.
 *
 * Numbers are pulled from PLANS in @wi/core/monetization so the
 * page can't drift out of sync with the actual server-side limits.
 */
export default function PricingPage() {
  const free = PLANS.free;
  const premium = PLANS.premium;

  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '∞');

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 bg-dreamy-vertical">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
      >
        ← Home
      </Link>

      <header className="mt-8">
        <Eyebrow>★ Pricing</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight text-brand-ink">
          매일 더 깊은 대화로.
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-brand-ink-soft">
          무료로도 충분히 체험할 수 있어요. 더 자주 만나고 싶다면 Premium 으로
          한도와 깊이를 함께 올려보세요.
        </p>
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {/* Free */}
        <article className="rounded-3xl border border-brand-ink/12 bg-white/80 p-6">
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
            Free
          </div>
          <div className="mt-1 font-display text-3xl text-brand-ink">₩0</div>
          <p className="mt-2 font-sans text-[13px] text-brand-ink-soft">매일 무료로 사용</p>
          <ul className="mt-5 space-y-2 font-sans text-[14px] text-brand-ink">
            <li>· 대화 {fmt(free.dailyMessages)}회 / 일</li>
            <li>· 셀카 {fmt(free.dailyImages)}장 / 일</li>
            <li>· 사진 분석 {fmt(free.dailyVision)}회 / 일</li>
            <li>· 음성 듣기 {fmt(free.dailyTtsChars)}자 / 일</li>
            <li className="text-brand-ink-soft">· 날씨송 (Premium 전용)</li>
          </ul>
          <Link
            href="/login"
            className="mt-6 flex h-11 items-center justify-center rounded-full border border-brand-ink/15 bg-white font-sans text-[14px] font-medium text-brand-ink transition hover:border-brand-ink/30"
          >
            무료로 시작
          </Link>
        </article>

        {/* Premium */}
        <article className="relative overflow-hidden rounded-3xl border-2 border-brand-accent bg-white p-6">
          <span className="absolute right-4 top-4 rounded-full bg-brand-accent/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-brand-accent">
            추천
          </span>
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-accent">
            Premium
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-3xl text-brand-ink">
              ₩{PRICING.KR.monthly.toLocaleString()}
            </span>
            <span className="font-sans text-[14px] text-brand-ink-soft">/ 월</span>
          </div>
          <p className="mt-2 font-sans text-[13px] text-brand-ink-soft">
            연간 결제 ₩{PRICING.KR.yearly.toLocaleString()} (2개월 무료)
          </p>
          <ul className="mt-5 space-y-2 font-sans text-[14px] text-brand-ink">
            <li>· 대화 {fmt(premium.dailyMessages)}회 / 일</li>
            <li>· 셀카 {fmt(premium.dailyImages)}장 / 일</li>
            <li>· 날씨송 {fmt(premium.dailySongs)}곡 / 일</li>
            <li>· 사진 분석 {fmt(premium.dailyVision)}회 / 일</li>
            <li>· 음성 듣기 무제한</li>
            <li>· 깊이 있는 Claude 모델 우선 적용</li>
            <li>· 장기 기억 + 광고 제거</li>
          </ul>
          <div className="mt-6">
            <WaitlistButton />
          </div>
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
            결제 시스템 곧 오픈 — 가입자 우선 안내
          </p>
        </article>
      </div>

      <section className="mt-12 rounded-3xl bg-white/50 p-6">
        <h2 className="font-display text-2xl text-brand-ink">크레딧 패키지 (예정)</h2>
        <p className="mt-2 font-sans text-[14px] text-brand-ink-soft">
          구독 없이도 필요한 만큼만 충전해서 사용. 셀카 5크레딧, 날씨송 30크레딧.
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          <li className="rounded-2xl border border-brand-ink/10 p-4">
            <div className="font-display text-xl text-brand-ink">₩4,900</div>
            <div className="font-sans text-[13px] text-brand-ink-soft">100 크레딧</div>
          </li>
          <li className="rounded-2xl border border-brand-ink/10 p-4">
            <div className="font-display text-xl text-brand-ink">₩9,900</div>
            <div className="font-sans text-[13px] text-brand-ink-soft">
              250 크레딧 · <span className="text-brand-accent">+50 보너스</span>
            </div>
          </li>
          <li className="rounded-2xl border border-brand-ink/10 p-4">
            <div className="font-display text-xl text-brand-ink">₩19,900</div>
            <div className="font-sans text-[13px] text-brand-ink-soft">
              600 크레딧 · <span className="text-brand-accent">+200 보너스</span>
            </div>
          </li>
        </ul>
      </section>

      <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        무료 한도는 매일 자정(KST)에 자동 리셋돼요.
      </p>
    </main>
  );
}
