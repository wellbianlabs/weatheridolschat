-- ============================================================================
-- Row Level Security policies
-- Principle: each user can only read/write their own rows.
-- Static catalogs (characters, quests) are readable by all authenticated users.
-- ============================================================================

-- profiles -------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- characters -----------------------------------------------------------------
alter table public.characters enable row level security;
drop policy if exists "characters_select_all" on public.characters;
create policy "characters_select_all"
  on public.characters for select
  using (true);

-- sessions -------------------------------------------------------------------
alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select
  using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions for update
  using (auth.uid() = user_id);

-- messages -------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
  on public.messages for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id and s.user_id = auth.uid()
    )
  );

-- weather_snapshots ----------------------------------------------------------
alter table public.weather_snapshots enable row level security;
drop policy if exists "weather_select_authenticated" on public.weather_snapshots;
create policy "weather_select_authenticated"
  on public.weather_snapshots for select
  using (auth.role() = 'authenticated');

-- subscriptions --------------------------------------------------------------
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- quests / quest_progress ----------------------------------------------------
alter table public.quests enable row level security;
drop policy if exists "quests_select_all" on public.quests;
create policy "quests_select_all"
  on public.quests for select
  using (true);

alter table public.quest_progress enable row level security;
drop policy if exists "quest_progress_select_own" on public.quest_progress;
create policy "quest_progress_select_own"
  on public.quest_progress for select
  using (auth.uid() = user_id);
drop policy if exists "quest_progress_insert_own" on public.quest_progress;
create policy "quest_progress_insert_own"
  on public.quest_progress for insert
  with check (auth.uid() = user_id);
drop policy if exists "quest_progress_update_own" on public.quest_progress;
create policy "quest_progress_update_own"
  on public.quest_progress for update
  using (auth.uid() = user_id);

-- token_ledger ---------------------------------------------------------------
alter table public.token_ledger enable row level security;
drop policy if exists "token_ledger_select_own" on public.token_ledger;
create policy "token_ledger_select_own"
  on public.token_ledger for select
  using (auth.uid() = user_id);

-- recommendation_events ------------------------------------------------------
alter table public.recommendation_events enable row level security;
drop policy if exists "rec_events_select_own" on public.recommendation_events;
create policy "rec_events_select_own"
  on public.recommendation_events for select
  using (auth.uid() = user_id);
drop policy if exists "rec_events_insert_own" on public.recommendation_events;
create policy "rec_events_insert_own"
  on public.recommendation_events for insert
  with check (auth.uid() = user_id);

-- moderation_logs ------------------------------------------------------------
alter table public.moderation_logs enable row level security;
drop policy if exists "moderation_logs_select_own" on public.moderation_logs;
create policy "moderation_logs_select_own"
  on public.moderation_logs for select
  using (auth.uid() = user_id);
-- inserts come from server (service_role) only — no client INSERT policy.
