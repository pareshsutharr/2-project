-- Port of the Python backend's persistent state onto Postgres, plus scheduling for the
-- auto-trade tick Edge Function.

-- 1. Server-side defaults for timestamp columns. The original SQLAlchemy models computed
--    these client-side (Python's datetime.utcnow()) with no server_default, which the new
--    Edge Functions (raw SQL, no ORM) can't rely on — add real defaults so every insert path
--    is safe.
alter table public.scripts alter column created_at set default (now() at time zone 'utc');
alter table public.execute_rows alter column created_at set default (now() at time zone 'utc');
alter table public.execute_rows alter column updated_at set default (now() at time zone 'utc');
alter table public.script_trigger_state alter column updated_at set default (now() at time zone 'utc');

-- 2. Cache tables (replace the Python in-process TTL dict caches) and edge/visual state
--    tables (replace the Python in-process Telegram dedupe dicts — these are correctness-
--    critical, not just a perf cache, since Edge Function invocations are stateless).

create table if not exists public.quote_cache (
  symbol text primary key,
  price numeric,
  fetched_at timestamptz not null default now()
);

create table if not exists public.nse_api_cache (
  cache_key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.news_cache (
  symbol text primary key,
  items jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.trigger_edge_state (
  script_id integer not null references public.scripts(id) on delete cascade,
  row_id integer not null,
  buy_zone boolean not null default false,
  sell_zone boolean not null default false,
  primary key (script_id, row_id)
);

create table if not exists public.trigger_visual_memory (
  script_id integer primary key references public.scripts(id) on delete cascade,
  buy_hit_once boolean not null default false,
  sell_hit_once boolean not null default false
);

-- 3. RLS on every new table, no policies — service_role (used by all Edge Functions) bypasses
--    RLS entirely, so this only blocks the public anon/authenticated Data API roles, matching
--    what's already enabled on scripts/execute_rows/script_trigger_state.
alter table public.quote_cache enable row level security;
alter table public.nse_api_cache enable row level security;
alter table public.news_cache enable row level security;
alter table public.trigger_edge_state enable row level security;
alter table public.trigger_visual_memory enable row level security;

-- 4. Scheduling: pg_cron + pg_net call the auto-trade-tick Edge Function every 5 seconds,
--    authenticated with the service_role key stored in Vault (never hardcoded in the cron
--    job SQL itself).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'REPLACE_WITH_SERVICE_ROLE_KEY',
  'service_role_key',
  'Used by pg_cron to authenticate calls to the auto-trade-tick Edge Function'
);

select cron.schedule(
  'auto-trade-tick',
  '5 seconds',
  $$
  select net.http_post(
    url := 'https://txpoozshjciwzzkzgqki.supabase.co/functions/v1/auto-trade-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 4500
  ) as request_id;
  $$
);
