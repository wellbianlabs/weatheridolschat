-- ============================================================================
-- Weather Idols Chat — initial schema (M2)
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
-- PostGIS is optional for MVP; uncomment if location queries need spatial ops.
-- create extension if not exists "postgis";

-- profiles -------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nickname        citext not null unique,
  birth_date      date,
  gender          text check (gender in ('female','male','nonbinary','prefer_not')),
  locale          text not null default 'ko',
  timezone        text not null default 'Asia/Seoul',
  primary_lat     numeric(9,6),
  primary_lng     numeric(9,6),
  primary_label   text,
  tier            text not null default 'free' check (tier in ('free','premium')),
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- characters (static, seeded) ------------------------------------------------
create table if not exists public.characters (
  id                      text primary key,
  display_name            text not null,
  display_name_en         text not null,
  motif                   text not null,
  origin_region           text not null,
  accent_color            text not null,
  short_bio               text not null,
  system_prompt           text not null,
  image_base_prompt       text not null,
  reference_image_url     text,
  seed                    bigint not null,
  recommendation_domains  text[] not null default '{}',
  sort_order              int not null default 0,
  active                  boolean not null default true
);

-- sessions -------------------------------------------------------------------
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  character_id      text not null references public.characters(id),
  title             text,
  pinned            boolean not null default false,
  last_message_at   timestamptz,
  memory_summary    text,
  created_at        timestamptz not null default now(),
  unique (user_id, character_id)
);

create index if not exists sessions_user_recent_idx
  on public.sessions (user_id, last_message_at desc nulls last);

-- weather_snapshots ----------------------------------------------------------
create table if not exists public.weather_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  lat                numeric(9,6) not null,
  lng                numeric(9,6) not null,
  location_label     text,
  temperature_c      numeric(4,1) not null,
  condition          text not null,
  humidity           int not null,
  wind_kph           numeric(4,1) not null,
  precipitation_mm   numeric(5,2) not null default 0,
  aqi                int,
  provider           text not null,
  observed_at        timestamptz not null,
  cached_until       timestamptz not null
);

create index if not exists weather_snapshots_loc_time_idx
  on public.weather_snapshots (lat, lng, observed_at desc);

-- messages -------------------------------------------------------------------
create table if not exists public.messages (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.sessions(id) on delete cascade,
  role                  text not null check (role in ('user','assistant','system','tool')),
  modality              text not null default 'text' check (modality in ('text','image','product','song','video')),
  content               text,
  metadata              jsonb,
  weather_snapshot_id   uuid references public.weather_snapshots(id),
  model                 text,
  token_usage           jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists messages_session_recent_idx
  on public.messages (session_id, created_at desc);

-- message_attachments --------------------------------------------------------
create table if not exists public.message_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  kind          text not null check (kind in ('image','audio','video')),
  storage_path  text not null,
  mime_type     text,
  width         int,
  height        int,
  duration_ms   int,
  created_at    timestamptz not null default now()
);

-- subscriptions --------------------------------------------------------------
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  provider                 text not null,
  plan                     text not null,
  status                   text not null,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  external_id              text,
  raw                      jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- quests & progress ----------------------------------------------------------
create table if not exists public.quests (
  id             text primary key,
  title          text not null,
  description    text not null,
  reward_tokens  int not null default 0,
  kind           text not null,
  active         boolean not null default true
);

create table if not exists public.quest_progress (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  quest_id       text not null references public.quests(id) on delete cascade,
  state          text not null default 'pending' check (state in ('pending','done','claimed')),
  completed_at   timestamptz,
  primary key (user_id, quest_id)
);

-- token_ledger (Wellbian off-chain MVP) --------------------------------------
create table if not exists public.token_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  delta       int not null,
  reason      text not null,
  ref_id      text,
  created_at  timestamptz not null default now()
);

create index if not exists token_ledger_user_time_idx
  on public.token_ledger (user_id, created_at desc);

-- recommendation_events (Nasmedia tracking) ----------------------------------
create table if not exists public.recommendation_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  message_id      uuid references public.messages(id) on delete set null,
  campaign_id     text not null,
  product_id      text not null,
  event           text not null check (event in ('impression','click','conversion')),
  revenue_amount  numeric(10,2),
  currency        text not null default 'KRW',
  created_at      timestamptz not null default now()
);

create index if not exists rec_events_user_time_idx
  on public.recommendation_events (user_id, created_at desc);

-- moderation_logs ------------------------------------------------------------
create table if not exists public.moderation_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete set null,
  input_text       text,
  stage            text not null check (stage in ('blocklist','openai_mod','persona_refusal')),
  matched_pattern  text,
  action           text not null check (action in ('block','refuse','warn')),
  created_at       timestamptz not null default now()
);

-- updated_at trigger --------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- auth.users -> profiles bootstrap ------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      'user_' || substr(new.id::text, 1, 8)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
