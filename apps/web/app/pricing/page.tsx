import Link from 'next/link';

import {
  CREDIT_PACKAGES,
  CREDIT_PACKAGE_ORDER,
  PLANS,
  PRICING,
  packageTotal,
} from '@wi/core/monetization';
import { Eyebrow } from '@wi/ui/web';

import HeaderNav from '@/components/HeaderNav';

import CheckoutButton from './checkout-button';

export const dynamic = 'force-dynamic';

/**
 * Pricing landing page.
 *
 * Subscription tiles (Free / Premium) drive recurring revenue;
 * credit packs are one-time top-ups for non-subscribers who want
 * occasional selfies / songs without committing to a plan.
 *
 * Numbers are pulled from PLANS + CREDIT_PACKAGES in
 * @wi/core/monetization so the page can't drift out of sync with
 * the server-side limits and prices.
 */
export default function PricingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const free = PLANS.free;
  const premium = PLANS.premium;
  const errorMessage = decodeError(searchParams.error);

  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '∞');

  return (
    <main className="bg-dreamy-vertical min-h-screen">
      <HeaderNav />
      <div className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <Eyebrow>★ Pricing</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight text-brand-ink">
          매일 더 깊은 대화로.
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-brand-ink-soft">
          무료로도 충분히 체험할 수 있어요. 더 자주 만나고 싶다면 Premium 으로
          한도와 깊이를 함께 올려보세요.
        </p>
      </header>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-300/40 bg-red-50/50 px-4 py-3 font-sans text-[13px] text-red-700">
          {errorMessage}
        </div>
      ) : null}

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
            <li className="text-brand-ink-soft">· 날씨송 (Premium 또는 크레딧 전용)</li>
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
          <div className="mt-6 space-y-2">
            <CheckoutButton kind="subscription" plan="monthly">
              월 ₩{PRICING.KR.monthly.toLocaleString()} 구독 시작
            </CheckoutButton>
            <CheckoutButton kind="subscription" plan="yearly" variant="outline">
              연 ₩{PRICING.KR.yearly.toLocaleString()} (2개월 무료)
            </CheckoutButton>
          </div>
        </article>
      </div>

      {/* Credit packs */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-brand-ink">크레딧 패키지</h2>
        <p className="mt-2 font-sans text-[14px] text-brand-ink-soft">
          구독 없이 필요한 만큼만 충전. 셀카 5크레딧 / 날씨송 30크레딧.
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {CREDIT_PACKAGE_ORDER.map((sku) => {
            const pkg = CREDIT_PACKAGES[sku];
            return (
              <li
                key={sku}
                className="rounded-2xl border border-brand-ink/10 bg-white p-4"
              >
                <div className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
                  {pkg.label}
                </div>
                <div className="mt-1 font-display text-2xl text-brand-ink">
                  ₩{pkg.priceKrw.toLocaleString()}
                </div>
                <div className="font-sans text-[13px] text-brand-ink-soft">
                  {pkg.baseCredits.toLocaleString()} 크레딧
                  {pkg.bonus > 0 ? (
                    <span className="text-brand-accent">
                      {' '}
                      + {pkg.bonus} 보너스
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft/70">
                  셀카 {Math.floor(packageTotal(sku) / 5)}장 / 날씨송{' '}
                  {Math.floor(packageTotal(sku) / 30)}곡 분량
                </p>
                <div className="mt-4">
                  <CheckoutButton kind="credit_pack" sku={sku} variant="outline">
                    충전
                  </CheckoutButton>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        무료 한도는 매일 자정(KST)에 자동 리셋돼요. 구독은 언제든 해지 가능.
      </p>
      </div>
    </main>
  );
}

function decodeError(code: string | undefined): string | null {
  switch (code) {
    case 'canceled':
      return '결제를 취소했어요. 다시 시도해도 괜찮아요.';
    case 'amount_mismatch':
      return '결제 금액이 맞지 않아요. 다시 시도해주세요.';
    case 'payment_not_completed':
      return '결제가 완료되지 않았어요. 다시 시도해주세요.';
    case 'payment_failed':
      return '결제 처리 중 오류가 났어요. 잠시 후 다시 시도해주세요.';
    case 'no_provider':
      return '결제 시스템이 아직 연결되지 않았어요. (TOSS_SECRET_KEY 누락)';
    case 'no_db':
      return 'Payments DB가 아직 설정되지 않았어요. Supabase를 먼저 연결해주세요.';
    case 'not_found':
      return '결제 정보를 찾을 수 없어요.';
    case 'invalid_callback':
      return '잘못된 결제 콜백이에요.';
    case 'bad_sku':
      return '잘못된 상품 SKU예요.';
    default:
      return null;
  }
}
