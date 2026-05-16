import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  CREDIT_PACKAGES,
  SUBSCRIPTION_PLANS,
  type CreditPackSku,
  type SubscriptionPlanId,
} from '@wi/core/monetization';

import { recordPayment } from '@/lib/payments';
import { isTossConfigured, buildMockCheckoutUrl } from '@/lib/payments/toss';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/checkout
 *
 * Initiates either:
 *   { kind: 'credit_pack', sku: 'pack_100' | ... }
 *   { kind: 'subscription', plan: 'monthly' | 'yearly' }
 *
 * Behavior:
 *   • Resolves the calling user (must be signed in).
 *   • Inserts a `payments` row with status='pending'.
 *   • Returns the URL the client should redirect to:
 *       - Toss configured → Toss-hosted checkout (TODO Phase 4b: hit
 *         the Toss "create payment" REST or pass through to the
 *         client-side SDK).
 *       - Toss not yet configured → in-app /mock-checkout page,
 *         which lets the operator/dev simulate success or failure.
 *
 * The orderId we mint here is also the `payments.id` UUID — that
 * lets /api/payments/confirm look up the exact row by the same id
 * Toss bounces back to us.
 */
interface CheckoutBody {
  kind?: 'credit_pack' | 'subscription';
  sku?: CreditPackSku;
  plan?: SubscriptionPlanId;
}

export async function POST(req: Request): Promise<Response> {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'auth_required', message: '로그인이 필요해요.' } },
      { status: 401 },
    );
  }

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  let amount = 0;
  let label = '';
  let creditPack: CreditPackSku | undefined;
  let plan: SubscriptionPlanId | undefined;

  if (body.kind === 'credit_pack') {
    if (!body.sku || !CREDIT_PACKAGES[body.sku]) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Unknown SKU' } },
        { status: 400 },
      );
    }
    creditPack = body.sku;
    amount = CREDIT_PACKAGES[body.sku].priceKrw;
    label = `${CREDIT_PACKAGES[body.sku].label} (${CREDIT_PACKAGES[body.sku].baseCredits} + ${CREDIT_PACKAGES[body.sku].bonus} 보너스)`;
  } else if (body.kind === 'subscription') {
    if (!body.plan || !SUBSCRIPTION_PLANS[body.plan]) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Unknown plan' } },
        { status: 400 },
      );
    }
    plan = body.plan;
    amount = SUBSCRIPTION_PLANS[body.plan].priceKrw;
    label = SUBSCRIPTION_PLANS[body.plan].label;
  } else {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'kind must be credit_pack or subscription' } },
      { status: 400 },
    );
  }

  // Mint the orderId up front so the same value flows: payments.id
  // → Toss orderId → confirm callback. Lets the confirm route look
  // up the pending payment row in a single query.
  const orderId = randomUUID();

  const paymentId = await recordPayment({
    userId: user.id,
    kind: body.kind!,
    status: 'pending',
    amountKrw: amount,
    creditPack,
    creditsDelta:
      creditPack !== undefined
        ? CREDIT_PACKAGES[creditPack].baseCredits + CREDIT_PACKAGES[creditPack].bonus
        : 0,
    providerTxnId: orderId,
  });

  if (!paymentId) {
    return NextResponse.json(
      {
        error: {
          code: 'service_unavailable',
          message: 'Payments DB가 설정되지 않았어요. Supabase + service-role key를 먼저 연결해주세요.',
        },
      },
      { status: 503 },
    );
  }

  // Mock vs Live decision. When TOSS_SECRET_KEY is missing we route
  // the user through /mock-checkout, which renders a confirm/cancel
  // pair of buttons so anyone can test the end-to-end flow without
  // a real merchant account.
  if (!isTossConfigured()) {
    const returnTo = `/api/payments/confirm?paymentKey=mock_${orderId}&orderId=${orderId}&amount=${amount}&mock=1`;
    return NextResponse.json({
      orderId,
      amount,
      label,
      provider: 'mock',
      // Front-end navigates the user to this URL.
      checkoutUrl: buildMockCheckoutUrl(orderId, returnTo),
    });
  }

  // ── Toss live path ────────────────────────────────────────────
  // Phase 4b will replace this stub with the actual Toss "create
  // payment session" call. For now we hand back the parameters the
  // client SDK needs to drive the widget.
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';
  return NextResponse.json({
    orderId,
    amount,
    label,
    provider: 'toss',
    clientKey,
    // Empty URL — client uses tosspayments-sdk to open the widget
    // instead of redirecting. (Phase 4b adds the actual SDK wiring
    // on the /pricing page.)
    checkoutUrl: null,
  });
}
