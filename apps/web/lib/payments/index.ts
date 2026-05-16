import {
  CREDIT_PACKAGES,
  SUBSCRIPTION_PLANS,
  packageTotal,
  type CreditPackSku,
  type SubscriptionPlanId,
} from '@wi/core/monetization';

import { getServiceSupabase } from '../supabase/service';

/**
 * Server-side payments / subscriptions / credits.
 *
 * All writes flow through the service-role Supabase client so RLS
 * doesn't get in the way. Reads from API routes use this module too
 * (instead of the user-scoped client) to avoid double round-trips.
 *
 * Convention: every function returns null / safe defaults when
 * Supabase isn't configured yet — Phase 1 deployments without DB
 * keep working with the mock-payment flow.
 */

export interface ActiveSubscription {
  id: string;
  plan: SubscriptionPlanId;
  status: 'active' | 'canceled' | 'expired' | 'past_due';
  currentPeriodEnd: string;
  nextChargeAt: string | null;
}

/**
 * Return the user's currently-effective subscription, or null.
 *
 * "Effective" here means status is active OR canceled but the paid
 * period hasn't ended yet. A user who cancels mid-month should keep
 * premium access until current_period_end.
 */
export async function getActiveSubscription(
  userId: string,
): Promise<ActiveSubscription | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;
  const { data, error } = await svc
    .from('subscriptions')
    .select('id, plan, status, current_period_end, next_charge_at')
    .eq('user_id', userId)
    .in('status', ['active', 'canceled'])
    .gte('current_period_end', new Date().toISOString())
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    plan: data.plan as SubscriptionPlanId,
    status: data.status as ActiveSubscription['status'],
    currentPeriodEnd: data.current_period_end as string,
    nextChargeAt: (data.next_charge_at as string | null) ?? null,
  };
}

export interface CreditBalanceRow {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
}

const EMPTY_BALANCE: CreditBalanceRow = {
  balance: 0,
  totalPurchased: 0,
  totalConsumed: 0,
};

export async function getCreditBalance(userId: string): Promise<CreditBalanceRow> {
  const svc = getServiceSupabase();
  if (!svc) return EMPTY_BALANCE;
  const { data, error } = await svc
    .from('credit_balance')
    .select('balance, total_purchased, total_consumed')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return EMPTY_BALANCE;
  return {
    balance: (data.balance as number) ?? 0,
    totalPurchased: (data.total_purchased as number) ?? 0,
    totalConsumed: (data.total_consumed as number) ?? 0,
  };
}

/**
 * Add credits to the user's balance and bump the lifetime
 * total_purchased counter. UPSERT-based so the first call for a new
 * user creates the row.
 */
export async function addCredits(
  userId: string,
  delta: number,
): Promise<{ ok: boolean; newBalance: number }> {
  const svc = getServiceSupabase();
  if (!svc) return { ok: false, newBalance: 0 };
  if (delta <= 0) return { ok: false, newBalance: 0 };
  const current = await getCreditBalance(userId);
  const next = current.balance + delta;
  const { error } = await svc.from('credit_balance').upsert(
    {
      user_id: userId,
      balance: next,
      total_purchased: current.totalPurchased + delta,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error(`[payments] addCredits fail: ${error.message}`);
    return { ok: false, newBalance: current.balance };
  }
  return { ok: true, newBalance: next };
}

/**
 * Try to consume `cost` credits. Returns ok=false (and leaves
 * balance untouched) when there aren't enough. Caller is responsible
 * for falling back to a paywall / different gate when ok=false.
 *
 * Atomic-ish: like the quota helper, this read-then-write is fine
 * under normal user concurrency (a single user can't burn through
 * dozens of selfie clicks in the same millisecond) but isn't a
 * fortress-grade lock. Move to a Postgres function if we ever need it.
 */
export async function consumeCredits(
  userId: string,
  cost: number,
): Promise<{ ok: boolean; balanceBefore: number; balanceAfter: number }> {
  const svc = getServiceSupabase();
  if (!svc) return { ok: false, balanceBefore: 0, balanceAfter: 0 };
  if (cost <= 0) {
    const cur = await getCreditBalance(userId);
    return { ok: true, balanceBefore: cur.balance, balanceAfter: cur.balance };
  }
  const current = await getCreditBalance(userId);
  if (current.balance < cost) {
    return { ok: false, balanceBefore: current.balance, balanceAfter: current.balance };
  }
  const next = current.balance - cost;
  const { error } = await svc.from('credit_balance').upsert(
    {
      user_id: userId,
      balance: next,
      total_consumed: current.totalConsumed + cost,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error(`[payments] consumeCredits fail: ${error.message}`);
    return { ok: false, balanceBefore: current.balance, balanceAfter: current.balance };
  }
  return { ok: true, balanceBefore: current.balance, balanceAfter: next };
}

// ── Payment record helpers ──────────────────────────────────────────────

export interface RecordPaymentInput {
  userId: string;
  kind: 'subscription' | 'credit_pack' | 'refund';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amountKrw: number;
  /** When kind='credit_pack' — the SKU purchased. */
  creditPack?: CreditPackSku;
  /** When kind='subscription' — the sub row id. */
  subscriptionId?: string;
  /** Credits granted (positive on purchase, negative on refund). */
  creditsDelta?: number;
  /** Provider order/payment identifier — Toss paymentKey on confirm. */
  providerTxnId?: string;
  errorCode?: string;
  errorMsg?: string;
}

export async function recordPayment(input: RecordPaymentInput): Promise<string | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;
  const { data, error } = await svc
    .from('payments')
    .insert({
      user_id: input.userId,
      kind: input.kind,
      subscription_id: input.subscriptionId ?? null,
      credit_pack: input.creditPack ?? null,
      credits_delta: input.creditsDelta ?? 0,
      amount_krw: input.amountKrw,
      status: input.status,
      provider_txn_id: input.providerTxnId ?? null,
      error_code: input.errorCode ?? null,
      error_msg: input.errorMsg ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.error(`[payments] recordPayment fail: ${error.message}`);
    return null;
  }
  return (data?.id as string) ?? null;
}

export async function listRecentPayments(userId: string, limit = 10) {
  const svc = getServiceSupabase();
  if (!svc) return [];
  const { data, error } = await svc
    .from('payments')
    .select('id, kind, credit_pack, credits_delta, amount_krw, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error(`[payments] listRecentPayments fail: ${error.message}`);
    return [];
  }
  return data ?? [];
}

// ── Subscription lifecycle helpers ──────────────────────────────────────

export async function activateSubscription(opts: {
  userId: string;
  plan: SubscriptionPlanId;
  billingKey?: string;
}): Promise<string | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;
  const plan = SUBSCRIPTION_PLANS[opts.plan];
  const now = new Date();
  const end = new Date(now.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);

  // Mark any existing active sub for this user as superseded so
  // the partial unique index doesn't collide.
  await svc
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: now.toISOString() })
    .eq('user_id', opts.userId)
    .eq('status', 'active');

  const { data, error } = await svc
    .from('subscriptions')
    .insert({
      user_id: opts.userId,
      plan: opts.plan,
      status: 'active',
      billing_key: opts.billingKey ?? null,
      current_period_end: end.toISOString(),
      next_charge_at: end.toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    console.error(`[payments] activateSubscription fail: ${error.message}`);
    return null;
  }
  return (data?.id as string) ?? null;
}

export async function cancelSubscription(userId: string): Promise<boolean> {
  const svc = getServiceSupabase();
  if (!svc) return false;
  const { error } = await svc
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString(), next_charge_at: null })
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) {
    console.error(`[payments] cancelSubscription fail: ${error.message}`);
    return false;
  }
  return true;
}

// Re-exports for convenience in route handlers / pages.
export { CREDIT_PACKAGES, SUBSCRIPTION_PLANS, packageTotal };
export type { CreditPackSku, SubscriptionPlanId };
