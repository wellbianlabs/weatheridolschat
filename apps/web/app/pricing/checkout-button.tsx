'use client';

import { useState } from 'react';

import type { CreditPackSku, SubscriptionPlanId } from '@wi/core/monetization';

/**
 * Checkout button used by both subscription tiles and credit-pack
 * tiles on /pricing.
 *
 * Flow:
 *   1. POST /api/payments/checkout → server mints a `payments` row
 *      with status='pending' and returns a redirect URL.
 *   2. If `checkoutUrl` is present (mock or Toss-redirect mode), we
 *      navigate the browser there.
 *   3. If `checkoutUrl` is null (Toss SDK widget mode — Phase 4b),
 *      we'd open the widget here. For Phase 4 we just show an error
 *      because the SDK isn't wired yet.
 */
export default function CheckoutButton({
  kind,
  sku,
  plan,
  children,
  variant = 'accent',
}: {
  kind: 'credit_pack' | 'subscription';
  sku?: CreditPackSku;
  plan?: SubscriptionPlanId;
  children: React.ReactNode;
  variant?: 'accent' | 'outline';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, sku, plan }),
      });
      const data = (await res.json()) as {
        checkoutUrl?: string | null;
        provider?: string;
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        if (res.status === 401) {
          // Bounce to login with return-to so the user comes back
          // to /pricing to retry after signing in.
          window.location.href = `/login?next=${encodeURIComponent('/pricing')}`;
          return;
        }
        throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      // Toss SDK widget mode — Phase 4b hooks the Toss client SDK
      // here. For now surface a friendly message.
      throw new Error('결제 위젯이 아직 연결되지 않았어요. (Phase 4b 예정)');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const className =
    variant === 'accent'
      ? 'flex h-11 w-full items-center justify-center rounded-full bg-brand-accent font-sans text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-60'
      : 'flex h-11 w-full items-center justify-center rounded-full border border-brand-ink/15 bg-white font-sans text-[14px] font-medium text-brand-ink transition hover:border-brand-ink/30 disabled:opacity-60';

  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className={className}>
        {busy ? '결제 페이지 여는 중…' : children}
      </button>
      {error ? (
        <p className="mt-2 font-mono text-[10px] text-red-500">{error}</p>
      ) : null}
    </div>
  );
}
