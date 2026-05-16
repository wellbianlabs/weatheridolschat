# Phase 4 — Payments / Subscriptions / Credits Schema

Run this once in **Supabase Studio → SQL Editor**. Idempotent — safe to re-run.

```sql
-- ── subscriptions ───────────────────────────────────────────────────────
-- Active subscription state per user. At most one ACTIVE row per user
-- at a time (enforced by partial unique index below). New rows are
-- created on first payment; status flips to 'canceled' or 'expired'
-- when the user cancels or the webhook reports a renewal failure.
create table if not exists public.subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  plan         text        not null check (plan in ('monthly', 'yearly')),
  status       text        not null check (status in ('active', 'canceled', 'expired', 'past_due')),
  -- Provider-side identifier. For Toss this is the billingKey we issue
  -- once and reuse for every monthly charge.
  billing_key  text,
  -- When the *current paid period* ends. While now() < current_period_end
  -- the user is treated as 'premium' tier regardless of status='canceled'
  -- (they paid, they get the time they paid for).
  current_period_end timestamptz not null,
  -- When the next auto-charge will hit, or NULL when canceled.
  next_charge_at     timestamptz,
  canceled_at        timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Only one ACTIVE row per user at a time. Multiple historical rows
-- are fine (canceled subs, expired ones).
create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions (user_id)
  where status = 'active';

create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

-- ── credit_balance ──────────────────────────────────────────────────────
-- Per-user credit balance. One row per user, ever — updated in place
-- when credits are added (purchase) or consumed (selfie / song).
create table if not exists public.credit_balance (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  balance    integer     not null default 0,
  -- Lifetime totals, never reset. Useful for analytics + abuse detection.
  total_purchased integer not null default 0,
  total_consumed  integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ── payments ────────────────────────────────────────────────────────────
-- Audit trail for every payment event. Stripe/Toss-style append-only:
-- we never UPDATE these, we INSERT a new row for refunds/cancels.
create table if not exists public.payments (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('subscription', 'credit_pack', 'refund')),
  -- Reference to the subscription this payment relates to, if any.
  subscription_id uuid     references public.subscriptions(id),
  -- The credit package SKU when kind='credit_pack' ('pack_100', 'pack_250', 'pack_600').
  credit_pack  text,
  -- Credits granted (signed: positive for purchase, negative for refund).
  credits_delta integer    not null default 0,
  amount_krw   integer     not null,           -- gross amount charged
  status       text        not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  -- Provider's transaction id. Toss returns this on confirm.
  provider_txn_id text,
  provider     text        not null default 'toss',
  error_code   text,
  error_msg    text,
  created_at   timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments(user_id, created_at desc);

-- ── waitlist ────────────────────────────────────────────────────────────
-- Phase 3's "출시 알림 받기" button stores intent locally; Phase 4
-- gives it a server-side home so we can email these users when
-- payments go live.
create table if not exists public.waitlist (
  email      text        primary key,
  user_id    uuid        references auth.users(id) on delete set null,
  source     text        default 'pricing_page',
  created_at timestamptz not null default now()
);

-- ── touch_updated_at trigger (reused) ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists credit_balance_touch on public.credit_balance;
create trigger credit_balance_touch
  before update on public.credit_balance
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────
-- Users can read their own state. All writes flow through the service
-- role client on the server side, so we don't grant INSERT/UPDATE.
alter table public.subscriptions enable row level security;
alter table public.credit_balance enable row level security;
alter table public.payments enable row level security;
alter table public.waitlist enable row level security;

drop policy if exists "sub_self_read" on public.subscriptions;
create policy "sub_self_read" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "credit_self_read" on public.credit_balance;
create policy "credit_self_read" on public.credit_balance
  for select using (auth.uid() = user_id);

drop policy if exists "payment_self_read" on public.payments;
create policy "payment_self_read" on public.payments
  for select using (auth.uid() = user_id);

-- waitlist is write-only from the user's perspective — anyone (incl
-- anon) can INSERT their email, nobody can SELECT it (admin reads via
-- service role in Supabase Studio).
drop policy if exists "waitlist_open_insert" on public.waitlist;
create policy "waitlist_open_insert" on public.waitlist
  for insert with check (true);
```

## What the columns mean

* **`subscriptions.current_period_end`** — the cutoff that quota promotion
  checks against. `now() < current_period_end && status in ('active','canceled')`
  means the user is still entitled to premium tier.
* **`credit_balance.balance`** — non-negative integer. The deduct
  helper rejects calls that would push it below zero.
* **`payments.credits_delta`** — signed: `+100` for a purchase, `-100`
  for a refund. Lets us reconstruct lifetime totals from this table
  alone if `credit_balance` ever drifts.
* **`payments.provider_txn_id`** — Toss's `paymentKey` (one-time) or
  `billingKey` (subscription). Used to look up the original payment
  for refunds / cancellation.

## Order of operations on first paid subscription

1. User clicks Subscribe → `POST /api/payments/checkout` → returns Toss URL.
2. User pays on Toss → Toss redirects to `/api/payments/confirm?paymentKey=...`.
3. Server calls Toss `POST /v1/payments/confirm` to lock the charge.
4. Server INSERTs a `subscriptions` row with status='active' + the
   billingKey returned by Toss, AND a `payments` row with status='paid'.
5. `resolveUser()` from now on sees the active sub → tier='premium'.

## Order of operations on credit pack

1. User clicks Buy Pack → `POST /api/payments/checkout` → Toss URL.
2. User pays → Toss redirects to `/api/payments/confirm`.
3. Server confirms with Toss, then INSERT a `payments` row (status=paid)
   AND UPSERT `credit_balance` adding the pack's credits.
4. Credit balance is immediately visible on `/account` and consumed
   automatically when the user hits a quota wall.
