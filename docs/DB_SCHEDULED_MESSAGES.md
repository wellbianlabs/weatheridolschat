# Scheduled Greetings — schema + ops

Adds 4×/day proactive weather greetings from each Premium user's
last-chatted character. The cron handler in
`apps/web/app/api/cron/weather-greeting/route.ts` writes into one new
table; the chat client polls a server endpoint to surface the rows
inside the active conversation.

## How to apply the migration

Run the SQL in `supabase/migrations/20260517000001_scheduled_messages.sql`
against your Supabase project (`supabase db push`, or paste into the
SQL editor in the Supabase dashboard).

Verify:

```sql
select count(*) from public.scheduled_messages;  -- 0 expected
select indexrelname from pg_indexes
  where tablename = 'scheduled_messages';        -- pending_idx present
```

## Required environment variables

| Var | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | cron handler writes + pending/ack endpoints read with this |
| `ANTHROPIC_API_KEY` | greeting content is generated through the premium chat path (Claude) |
| `KW_API_KEY` or `OPENWEATHERMAP_API_KEY` | weather data feeding the greeting |
| `CRON_SECRET` | Vercel sets this automatically when `vercel.json` declares crons. Handler validates the `Authorization: Bearer <CRON_SECRET>` header so no one can call the cron URL from outside Vercel. |

## Cron schedule

`vercel.json` defines four `crons` entries:

| KST  | UTC   | Slot value         |
| ---- | ----- | ------------------ |
| 07:00 | 22:00 (prev day) | `morning_7` |
| 12:00 | 03:00 | `lunch_12` |
| 18:00 | 09:00 | `evening_18` |
| 22:00 | 13:00 | `night_22` |

Cron URL: `/api/cron/weather-greeting?slot=<slot>` — Vercel passes the
`Authorization` header automatically.

## Idempotency

Each user/slot/day is unique. If a cron retries, the second insert hits
the `(user_id, slot, slot_date)` unique constraint and the handler
silently skips. `slot_date` is computed from the KST calendar day at
handler runtime, NOT the timestamp — so a 02:59 UTC retry on the same
KST day deduplicates correctly.

## Eligibility

A user receives greetings when ALL of these hold:

1. They have an `active`-status row in `subscriptions` whose
   `current_period_end` is in the future (Premium).
2. They have at least one row in `sessions` — i.e. they've chatted
   with at least one character. The handler picks the character with
   the most recent `last_message_at`.
3. Optional: per-user opt-out via `profiles.scheduled_greetings_enabled`
   (column not yet added; future enhancement).

Free-tier users and users who haven't chatted yet are skipped silently.

## Garbage collection

There's no automatic deletion. Rows accumulate forever. A future cron
can prune `delivered_at < now() - interval '30 days'` once we know the
analytics window we want.
