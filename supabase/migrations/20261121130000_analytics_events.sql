-- Product analytics: the 13 events from the onboarding spec, kept in Clara's own database (no third-party tracker).
-- No names, emails, answers' free text or IP addresses are stored. anonymous_id is a random id made by the app
-- on install; user_id is set only when the person is signed in, and is cleared when they delete their account.

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  name varchar(40) not null,
  anonymous_id uuid not null,
  user_id uuid references public.users (id) on delete set null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  platform varchar(16),
  os_version varchar(32),
  app_version varchar(32),
  country char(2),
  locale varchar(16),
  properties jsonb not null default '{}'::jsonb
);

create index analytics_events_name_time_idx on public.analytics_events (name, occurred_at);
create index analytics_events_user_idx on public.analytics_events (user_id) where user_id is not null;

-- "first_..." events count once per install, however often the app sends them.
create unique index analytics_events_first_once_idx on public.analytics_events (anonymous_id, name)
  where name like 'first\_%';

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from anon, authenticated;
