-- Every status change of an order: who made it, from what to what, and why. Payment events from Stripe are recorded
-- with no actor. The team works through the admin endpoints (/api/v1/admin/orders), which write a row here each time.

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  -- The admin who made the change; null for changes made by Stripe or the system.
  actor_user_id uuid references public.users (id) on delete set null,
  note varchar(500),
  created_at timestamptz not null default now()
);

create index order_status_events_order_idx on public.order_status_events (order_id, created_at);

-- When the team marked the order refunded (after refunding it in Stripe).
alter table public.orders add column if not exists refunded_at timestamptz;

alter table public.order_status_events enable row level security;
revoke all on table public.order_status_events from anon, authenticated;

-- To give someone on the team access (run once in the Supabase SQL editor):
--   update public.users set role = 'admin' where email = 'person@example.com';
