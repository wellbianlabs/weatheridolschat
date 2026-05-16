# Phase 2 — usage_daily Schema

Run this once in **Supabase Studio → SQL Editor** for your project. Idempotent (safe to re-run).

```sql
-- ── usage_daily ─────────────────────────────────────────────────────────
-- Per-user, per-day counters for the freemium quota system.
-- Reset semantics: rows are *keyed by KST date* (YYYY-MM-DD in Asia/Seoul),
-- so a brand-new row for tomorrow starts at zero automatically. We never
-- delete rows — old days stay for analytics.
--
-- Composite primary key (user_id, date) gives us O(1) upsert performance
-- and prevents accidental duplicate rows from race conditions.
create table if not exists public.usage_daily (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       text        not null,  -- 'YYYY-MM-DD' in KST
  messages   integer     not null default 0,
  selfies    integer     not null default 0,
  songs      integer     not null default 0,
  tts_chars  integer     not null default 0,
  vision     integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Auto-bump updated_at on every change.
create or replace function public.touch_usage_daily()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists usage_daily_touch on public.usage_daily;
create trigger usage_daily_touch
  before update on public.usage_daily
  for each row execute function public.touch_usage_daily();

-- ── Row Level Security ──────────────────────────────────────────────────
-- Users may READ only their own usage. Writes always go through the
-- service-role client on the server side, so we don't add an INSERT/
-- UPDATE policy — RLS will block anon/anon-key writes by default,
-- which is what we want.
alter table public.usage_daily enable row level security;

drop policy if exists "usage_self_read" on public.usage_daily;
create policy "usage_self_read"
  on public.usage_daily
  for select
  using (auth.uid() = user_id);

-- ── Helpful indexes ─────────────────────────────────────────────────────
-- The primary key already indexes (user_id, date) so we don't need a
-- separate one for the hot path. Add a date-only index later if we
-- start running daily-aggregate reports.
```

## Why this shape

* **Per-day, not per-month rollup** — easier to reset at KST midnight (just write a new row).
* **Integer counters per feature** — `messages` / `selfies` / `songs` / `tts_chars` / `vision`. Adding a new feature later = one ALTER TABLE adding a column.
* **Composite PK on (user\_id, date)** — atomic UPSERTs from the server. No race window between SELECT and UPDATE.
* **No INSERT/UPDATE RLS policies** — service-role bypass is the only write path. Prevents users from manually setting their own counters to 0 from the browser.

## Server access pattern

```ts
// Read for the current user (RLS: self only)
const { data } = await userClient
  .from('usage_daily')
  .select('*')
  .eq('user_id', userId)
  .eq('date', kstDateString())
  .single();

// Atomic increment (service role)
await serviceClient.rpc('increment_usage', {
  p_user_id: userId,
  p_date: kstDateString(),
  p_field: 'messages',
  p_delta: 1,
});
```

For now we do the increment via a simple UPSERT from the JS side. If
write throughput ever becomes a concern we can move to a Postgres
function (`increment_usage`) for true atomicity.
