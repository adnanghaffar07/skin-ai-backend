-- Face scan results: what the phone's analysis read (redness, shine, dark circles, blemishes) for each scan, so the
-- scan history follows the person to a new phone. Never the photo: photos stay on the phone, apart from the ones kept
-- for training (scan_images) by people who opted in.
--
-- client_id is the phone's own id for the scan ("scan-1795461200000"): saving the same scan twice changes nothing.

create table public.scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  client_id varchar(64) not null,
  analysed_at timestamptz not null,
  source varchar(16) not null default 'device',
  metrics jsonb not null,
  issues jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, client_id),
  constraint scan_results_source_check check (source in ('device', 'server'))
);

create index scan_results_user_time_idx on public.scan_results (user_id, analysed_at desc);

alter table public.scan_results enable row level security;
revoke all on table public.scan_results from anon, authenticated;
