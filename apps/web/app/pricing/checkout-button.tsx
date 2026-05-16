'use client';

import { useState } from 'react';

import type { CreditPackSku, SubscriptionPlanId } from '@wi/core/monetization';

import { getBrowserSupabase } from '@/lib/supabase/browser';

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

    // Belt-and-suspenders: if the client-side SDK is sitting on a
    // valid session, force a token refresh BEFORE the API call so
    // the cookie sent in the request is definitely fresh. This
    // sidesteps the case where the server sees a stale/expired
    // access token even though the browser thinks it's logged in.
    try {
      const supabase = getBrowserSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Touch refresh — quick if token is still valid, rotates
          // if it's near expiry. Side-effect: the new cookies
          // populate document.cookie before the fetch fires.
          await supabase.auth.refreshSession().catch(() => {
            /* refresh may fail if there is no refresh_token —
               we'll see the 401 a second later if so */
          });
        }
      }
    } catch {
      /* Pre-flight is best-effort. Continue regardless. */
    }

    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, sku, plan }),
        // credentials: 'include' is the default for same-origin, but
        // make it explicit so any CDN / browser quirk that turns it
        // off can't silently strip the auth cookie.
        credentials: 'include',
      });
      const data = (await res.json()) as {
        checkoutUrl?: string | null;
        provider?: string;
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        if (res.status === 401) {
          // Don't hard-redirect anymore. Show the user what happened
          // and give them a manual login button — auto-bouncing
          // away made it impossible to diagnose mismatched session
          // states ("client says logged in / server says anon").
          setError(
            '로그인 세션이 만료됐어요. 다시 로그인하거나 페이지를 새로고침해주세요.',
          );
          setBusy(false);
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
        <div className="mt-2 space-y-1">
          <p className="font-mono text-[10px] text-red-500">{error}</p>
          {/* If the failure was an auth one, the error string starts
              with "로그인 세션…". Offer a one-click recover path so
              the user isn't stuck on /pricing trying to figure out
              what to do. */}
          {error.startsWith('로그인 세션') ? (
            <a
              href={`/login?next=${encodeURIComponent('/pricing')}`}
              className="inline-block font-mono text-[10px] uppercase tracking-eyebrow text-brand-accent underline underline-offset-2"
            >
              로그인 페이지로 이동 →
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
