-- Orders. Clara does not stock products: after the customer pays, the team buys each item from the store it came from
-- (product_offers) and has it shipped to the customer. So every order item keeps both Clara's price (what the customer
-- paid) and the store's price and link at the time (what Clara pays), and the order moves through these steps:
--   pending_payment -> paid -> ordered_from_store -> shipped -> delivered
-- or ends as cancelled (payment never completed, or cancelled by the team) or refunded.

create type public.order_status as enum (
  'pending_payment', 'paid', 'ordered_from_store', 'shipped', 'delivered', 'cancelled', 'refunded'
);

create sequence public.order_number_seq start with 100001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Short number shown to the customer ("Order #100001").
  number bigint not null unique default nextval('public.order_number_seq'),
  -- Kept when the account is deleted: an order is a financial record.
  user_id uuid references public.users (id) on delete set null,
  idempotency_key varchar(64) not null,
  status public.order_status not null default 'pending_payment',
  market_code char(2) not null,
  currency_code char(3) not null,
  subtotal_amount numeric(12, 2) not null,
  shipping_option varchar(16) not null,
  shipping_amount numeric(12, 2) not null,
  total_amount numeric(12, 2) not null,
  -- Delivery details as the customer gave them.
  contact_name varchar(120) not null,
  contact_email varchar(254) not null,
  contact_phone varchar(32) not null,
  shipping_address text not null,
  delivery_note varchar(500),
  -- Payment. Card details never reach Clara: the customer pays on Stripe's own page.
  payment_provider varchar(16) not null,
  payment_session_id varchar(255) unique,
  payment_session_url text,
  payment_intent_id varchar(255),
  paid_at timestamptz,
  -- Filled in by the team as the order is fulfilled.
  carrier varchar(64),
  tracking_number varchar(128),
  ordered_from_store_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint orders_market_check check (market_code ~ '^[A-Z]{2}$'),
  constraint orders_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint orders_amounts_check check (subtotal_amount >= 0 and shipping_amount >= 0 and total_amount = subtotal_amount + shipping_amount),
  constraint orders_shipping_option_check check (shipping_option in ('standard', 'express', 'next_day')),
  constraint orders_payment_provider_check check (payment_provider in ('stripe'))
);

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  -- Copied at the time of the order, so later catalogue changes do not rewrite it.
  product_name varchar(255) not null,
  brand_name varchar(120) not null,
  image_url text,
  quantity integer not null,
  unit_amount numeric(12, 2) not null,
  line_amount numeric(12, 2) not null,
  -- Where the team buys it, and what it cost there when the customer ordered.
  retailer_name varchar(120),
  retailer_url text,
  retailer_external_id varchar(255),
  store_unit_amount numeric(12, 2),
  created_at timestamptz not null default now(),
  constraint order_items_quantity_check check (quantity between 1 and 10),
  constraint order_items_amounts_check check (unit_amount >= 0 and line_amount = unit_amount * quantity)
);

create index order_items_order_idx on public.order_items (order_id);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Same rule as every other table: no access from the public roles; the API uses its own login (clara_api).
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;
grant usage, select on sequence public.order_number_seq to clara_api;
