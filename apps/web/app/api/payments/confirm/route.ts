import { NextResponse } from 'next/server';

import {
  CREDIT_PACKAGES,
  type CreditPackSku,
  type SubscriptionPlanId,
} from '@wi/core/monetization';

import { activateSubscription, addCredits, recordPayment } from '@/lib/payments';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isTossConfigured, tossConfirmPayment } from '@/lib/payments/toss';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/confirm?paymentKey=...&orderId=...&amount=...
 *
 * Final hop of the checkout. Toss redirects the user here after the
 * payment widget closes; we then:
 *
 *   1. Locate the pending `payments` row matching `orderId` (== our
 *      provider_txn_id, == payments.id).
 *   2. Verify the amount the user just paid matches what we expected.
 *      Rejects tampered query strings.
 *   3. Call Toss `/v1/payments/confirm` to capture the charge.
 *      (Skipped in mock mode — &mock=1 flips us to "trust the
 *      caller" so dev runs can finish without real Toss creds.)
 *   4. Apply side-effects:
 *        kind='credit_pack'  → addCredits(user, total)
 *        kind='subscription' → activateSubscription(user, plan)
 *   5. Update the `payments` row to status='paid'.
 *   6. Redirect to /account?paid=1 so the user sees their balance
 *      / subscription immediately.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const paymentKey = url.searchParams.get('paymentKey') ?? '';
  const orderId = url.searchParams.get('orderId') ?? '';
  const amountParam = Number(url.searchParams.get('amount') ?? '0');
  const isMock = url.searchParams.get('mock') === '1';

  if (!paymentKey || !orderId || !amountParam) {
    return NextResponse.redirect(new URL('/pricing?error=invalid_callback', url));
  }

  const svc = getServiceSupabase();
  if (!svc) {
    return NextResponse.redirect(new URL('/pricing?error=no_db', url));
  }

  // 1. Locate the pending payment row.
  const { data: pending, error } = await svc
    .from('payments')
    .select('id, user_id, kind, credit_pack, credits_delta, amount_krw, status')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !pending) {
    console.error(`[confirm] no pending payment orderId=${orderId} err=${error?.message}`);
    return NextResponse.redirect(new URL('/pricing?error=not_found', url));
  }
  if (pending.status === 'paid') {
    // Idempotent: confirm endpoint can be hit twice (back button,
    // double redirect). Just bounce to /account either way.
    return NextResponse.redirect(new URL('/account?paid=already', url));
  }

  // 2. Sanity-check amount.
  if (Number(pending.amount_krw) !== amountParam) {
    console.warn(
      `[confirm] amount mismatch expected=${pending.amount_krw} got=${amountParam}`,
    );
    await markFailed(orderId, 'amount_mismatch', '결제 금액 불일치');
    return NextResponse.redirect(new URL('/pricing?error=amount_mismatch', url));
  }

  // 3. Capture on Toss (skipped in mock).
  if (!isMock && isTossConfigured()) {
    try {
      const result = await tossConfirmPayment({
        paymentKey,
        orderId,
        amount: amountParam,
      });
      if (result.status !== 'DONE') {
        await markFailed(orderId, 'toss_not_done', `Toss status=${result.status}`);
        return NextResponse.redirect(new URL('/pricing?error=payment_not_completed', url));
      }
    } catch (err) {
      await markFailed(orderId, 'toss_error', (err as Error).message);
      return NextResponse.redirect(new URL('/pricing?error=payment_failed', url));
    }
  } else if (!isMock && !isTossConfigured()) {
    // Live request but Toss missing — refuse rather than fake success.
    await markFailed(orderId, 'no_provider', 'TOSS_SECRET_KEY missing');
    return NextResponse.redirect(new URL('/pricing?error=no_provider', url));
  }

  // 4. Apply effects + flip the row to paid.
  if (pending.kind === 'credit_pack') {
    const sku = pending.credit_pack as CreditPackSku | null;
    if (!sku || !CREDIT_PACKAGES[sku]) {
      await markFailed(orderId, 'bad_sku', 'Credit pack SKU missing on payment row');
      return NextResponse.redirect(new URL('/pricing?error=bad_sku', url));
    }
    const pkg = CREDIT_PACKAGES[sku];
    const total = pkg.baseCredits + pkg.bonus;
    await addCredits(pending.user_id as string, total);
  } else if (pending.kind === 'subscription') {
    // Plan isn't stored on the payments row — derive from amount.
    // (We could add a `plan` column later; for now amount is unique
    // between monthly/yearly so this is unambiguous.)
    const plan: SubscriptionPlanId = amountParam >= 99_000 ? 'yearly' : 'monthly';
    await activateSubscription({
      userId: pending.user_id as string,
      plan,
    });
  }

  await svc
    .from('payments')
    .update({ status: 'paid', provider_txn_id: paymentKey })
    .eq('id', orderId);

  // 5. Redirect to /account so the user sees the result.
  return NextResponse.redirect(new URL('/account?paid=1', url));
}

async function markFailed(orderId: string, code: string, msg: string) {
  const svc = getServiceSupabase();
  if (!svc) return;
  await svc
    .from('payments')
    .update({ status: 'failed', error_code: code, error_msg: msg })
    .eq('id', orderId);
  // Also drop a fresh audit row so we have a chronological trail.
  await recordPayment({
    userId: (await svc.from('payments').select('user_id').eq('id', orderId).maybeSingle())
      .data?.user_id as string,
    kind: 'refund',
    status: 'failed',
    amountKrw: 0,
    errorCode: code,
    errorMsg: msg,
  }).catch(() => {});
}
