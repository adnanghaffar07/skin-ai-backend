-- One row per order email (payment received, shipped, delivered, refunded), so each goes out once
-- even when Stripe or the team repeats a step, and the team can see whether it was delivered to Resend.

create type public.order_email_status as enum ('sending', 'sent', 'failed', 'skipped');

create table public.order_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind varchar(32) not null,
  status public.order_email_status not null default 'sending',
  recipient varchar(320) not null,
  provider_message_id varchar(128),
  error varchar(500),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, kind)
);

alter table public.order_emails enable row level security;
revoke all on table public.order_emails from anon, authenticated;
