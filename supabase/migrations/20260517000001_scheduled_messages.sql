-- ============================================================================
-- Scheduled greetings — 4x/day cron-driven "good morning / good night" pings
-- from the user's last-chatted character, gated to Premium subscribers.
-- ============================================================================
--
-- Lifecycle of a row:
--   1. Vercel Cron fires `/api/cron/weather-greeting?slot=morning_7` four
--      times a day (KST 7am / 12pm / 6pm / 10pm).
--   2. Handler enumerates active Premium users, finds each user's most
--      recently-chatted character via `sessions`, generates a short weather-
--      aware Korean message via Claude, and inserts a row here.
--   3. The chat client polls `/api/scheduled/pending` once a minute while
--      the tab is visible. New rows for the active character get rendered
--      into the conversation as if the character just spoke.
--   4. The client then POSTs `/api/scheduled/ack` to flip `delivered_at`,
--      so the same message never appears twice.
--
-- Two correctness invariants the schema enforces:
--   a. At most one row per (user, slot, KST date) — even if the cron
--      retries we never double-send. `slot_date` is a plain DATE column
--      populated by the handler with today's KST date.
--   b. RLS is enabled but ZERO policies are defined. Service-role bypasses
--      RLS, so only the server (cron handler, pending/ack endpoints) can
--      read/write. Users never touch this table directly from the client.

create table if not exists public.scheduled_messages (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  character_id       text not null references public.characters(id),

  -- Which of the four daily windows this message belongs to. Used for
  -- analytics ("which slot has the best engagement?") and idempotency.
  slot               text not null check (
    slot in ('morning_7','lunch_12','evening_18','night_22')
  ),
  -- The KST calendar date the slot represents. Idempotency key combined
  -- with (user_id, slot) so a cron retry won't insert a duplicate.
  slot_date          date not null,

  content            text not null,
  -- Snapshot of the weather we used to compose the message, so we can
  -- explain mismatches later ("why did Sunny say it was sunny when it
  -- rained at noon?") without re-querying the weather provider. JSON
  -- shape mirrors WeatherSnapshot in packages/core/src/weather.
  weather_snapshot   jsonb,

  scheduled_for      timestamptz not null default now(),
  delivered_at       timestamptz,
  created_at         timestamptz not null default now(),

  unique (user_id, slot, slot_date)
);

-- The hot read path: "pending messages for this user on this character".
-- Partial index keeps it small because rows are deleted on ack only by
-- a future GC sweep — most are short-lived after delivery.
create index if not exists scheduled_messages_pending_idx
  on public.scheduled_messages (user_id, character_id)
  where delivered_at is null;

-- Lock the table to service-role traffic only. We deliberately do NOT
-- add a SELECT policy for `auth.uid() = user_id` because the chat
-- client reads via the server-side /api/scheduled/pending endpoint
-- (which uses the service-role key). If we ever want a direct
-- client-side subscription, add a SELECT policy at that point.
alter table public.scheduled_messages enable row level security;
