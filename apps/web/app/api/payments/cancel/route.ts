import { NextResponse } from 'next/server';

import { cancelSubscription } from '@/lib/payments';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/cancel
 *
 * Cancels the user's active subscription. status='canceled' is set
 * immediately; current_period_end stays as-is so the user keeps
 * premium access through the end of the period they already paid for.
 *
 * Phase 4b will additionally call Toss to remove the recurring
 * billingKey so the next-month auto-charge doesn't fire.
 */
export async function POST(): Promise<Response> {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'auth_required', message: '로그인이 필요해요.' } },
      { status: 401 },
    );
  }
  const ok = await cancelSubscription(user.id);
  if (!ok) {
    return NextResponse.json(
      {
        error: {
          code: 'no_active_subscription',
          message: '취소할 구독이 없어요.',
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
