import Link from 'next/link';

import { Eyebrow } from '@wi/ui/web';

export const dynamic = 'force-dynamic';

/**
 * Mock checkout page.
 *
 * Stands in for the Toss-hosted widget while we wait for merchant
 * approval. Renders a "Confirm" button that finishes the flow by
 * redirecting to the same /api/payments/confirm URL Toss would
 * use, and a "Cancel" button that bails back to /pricing.
 *
 * Phase 4b will remove this page once /api/payments/checkout starts
 * returning real Toss URLs.
 */
export default function MockCheckoutPage({
  searchParams,
}: {
  searchParams: { orderId?: string; returnTo?: string };
}) {
  const orderId = searchParams.orderId ?? '';
  const returnTo = searchParams.returnTo ?? '/pricing';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12 bg-dreamy-vertical">
      <Eyebrow>★ Sandbox</Eyebrow>
      <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-brand-ink">
        목업 결제 시뮬레이션
      </h1>
      <p className="mt-3 font-sans text-[15px] leading-relaxed text-brand-ink-soft">
        Toss Payments 가맹점 승인 전까지 사용하는 모의 결제 페이지에요.
        승인 후 <code>TOSS_SECRET_KEY</code> 환경변수가 설정되면 이 페이지는 더 이상
        사용되지 않고 실제 Toss 결제 위젯이 열립니다.
      </p>
      <div className="mt-3 rounded-2xl border border-dashed border-brand-ink/15 bg-white/50 p-3 font-mono text-[11px] text-brand-ink-soft">
        orderId: <span className="text-brand-ink">{orderId}</span>
      </div>

      <div className="mt-8 space-y-3">
        <a
          href={returnTo}
          className="flex h-12 w-full items-center justify-center rounded-full bg-brand-accent font-sans text-[15px] font-medium text-white transition hover:opacity-90"
        >
          ✓ 결제 성공으로 시뮬레이션
        </a>
        <Link
          href="/pricing?error=canceled"
          className="flex h-12 w-full items-center justify-center rounded-full border border-brand-ink/15 bg-white font-sans text-[14px] font-medium text-brand-ink-soft transition hover:border-brand-ink/30 hover:text-brand-ink"
        >
          취소하고 돌아가기
        </Link>
      </div>
    </main>
  );
}
