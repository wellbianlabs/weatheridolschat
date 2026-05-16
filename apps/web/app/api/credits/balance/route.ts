import { NextResponse } from 'next/server';

import { getCreditBalance } from '@/lib/payments';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/credits/balance
 *
 * Returns the signed-in user's current credit balance and lifetime
 * totals. Used by the AccountChip + /account page to display the
 * "X credits remaining" badge without polling the quota route.
 *
 * Anonymous → { balance: 0, totalPurchased: 0, totalConsumed: 0 }.
 */
export async function GET(): Promise<Response> {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ balance: 0, totalPurchased: 0, totalConsumed: 0 });
  }
  const row = await getCreditBalance(user.id);
  return NextResponse.json({
    balance: row.balance,
    totalPurchased: row.totalPurchased,
    totalConsumed: row.totalConsumed,
    tier: user.tier,
  });
}
