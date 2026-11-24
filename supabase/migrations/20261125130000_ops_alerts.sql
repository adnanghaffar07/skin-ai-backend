-- Monitoring and alerts (compliance plan: "alerts for failed logins and repeated errors"). The API runs as short-lived
-- serverless functions, so throttling and counting live in the database rather than in memory.
--   ops_alerts:   when each kind of alert email last went out, and how many were held back since (at most one per kind
--                 every 15 minutes, so an outage sends one email, not hundreds).
--   ops_counters: a running count in a time window (rejected sign-in tokens in the last 10 minutes).

create table public.ops_alerts (
  key varchar(64) primary key,
  last_sent_at timestamptz not null,
  held_back integer not null default 0
);

create table public.ops_counters (
  key varchar(64) primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

alter table public.ops_alerts enable row level security;
alter table public.ops_counters enable row level security;
revoke all on table public.ops_alerts from anon, authenticated;
revoke all on table public.ops_counters from anon, authenticated;
