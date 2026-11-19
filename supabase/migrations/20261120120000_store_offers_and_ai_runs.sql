-- Clara does not stock products. The AI service finds them at online stores; Clara saves each one with the store's
-- price and sells it at that price plus a markup. product_prices keeps holding Clara's selling price, so the catalogue,
-- recommendations and cart read prices the same way as before. This table keeps where the product comes from.

create table public.product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  market_code char(2) not null,
  retailer_name varchar(120) not null,
  retailer_domain varchar(255) not null,
  -- The store's own id for the product (SKU, ASIN, TCIN...).
  external_id varchar(255) not null,
  url text not null,
  store_currency_code char(3) not null,
  store_amount numeric(12, 2) not null,
  store_compare_at_amount numeric(12, 2),
  -- Markup applied to get Clara's price, in basis points (850 = 8.5%), kept with the price it produced.
  markup_bp integer not null,
  in_stock boolean not null default true,
  -- When the store price and stock were last read.
  checked_at timestamptz not null,
  -- 'ai' for products from the AI service, 'stub' for the stand-in used in development.
  source varchar(16) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_domain, external_id, market_code),
  constraint product_offers_market_check check (market_code ~ '^[A-Z]{2}$'),
  constraint product_offers_currency_check check (store_currency_code ~ '^[A-Z]{3}$'),
  constraint product_offers_url_check check (url ~ '^https://'),
  constraint product_offers_amount_check check (store_amount >= 0),
  constraint product_offers_compare_check check (store_compare_at_amount is null or store_compare_at_amount >= 0),
  constraint product_offers_markup_check check (markup_bp between 0 and 10000),
  constraint product_offers_source_check check (source in ('ai', 'stub', 'manual'))
);

create index product_offers_product_idx on public.product_offers (product_id);

create trigger product_offers_set_updated_at
  before update on public.product_offers
  for each row execute function public.set_updated_at();

-- One row per call to the AI service, so failures, speed and model versions can be reviewed.
-- Neither the request (the person's answers) nor the raw response is stored here.
create table public.ai_recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  submission_id uuid not null references public.questionnaire_submissions (id) on delete cascade,
  recommendation_set_id uuid references public.recommendation_sets (id) on delete set null,
  provider varchar(16) not null,
  status varchar(16) not null,
  model_version varchar(64),
  schema_version varchar(16),
  confidence varchar(8),
  products_returned integer not null default 0,
  products_kept integer not null default 0,
  latency_ms integer,
  error_code varchar(64),
  created_at timestamptz not null default now(),
  constraint ai_recommendation_runs_status_check check (status in ('succeeded', 'failed')),
  constraint ai_recommendation_runs_confidence_check check (confidence is null or confidence in ('high', 'medium', 'low'))
);

create index ai_recommendation_runs_user_idx on public.ai_recommendation_runs (user_id, created_at desc);

-- A plan built from the AI service's picks, as opposed to Clara's own rules.
alter type public.recommendation_basis add value if not exists 'ai_assisted';

-- The summary and limitations the AI service gives with a plan.
alter table public.recommendation_sets add column if not exists summary text;

-- Plans come in two tiers: the picks that fit the person's monthly budget (the routine is built from these), and the
-- best picks regardless of price, shown underneath as above budget. The ceiling the plan was fitted to is kept with it.
alter table public.recommendation_sets add column if not exists budget_ceiling numeric(12, 2);
alter table public.recommendation_items add column if not exists tier varchar(8) not null default 'budget';
alter table public.recommendation_items
  add constraint recommendation_items_tier_check check (tier in ('budget', 'best'));

-- Same rule as every other table: no access from the public roles; the API uses its own login (clara_api).
alter table public.product_offers enable row level security;
alter table public.ai_recommendation_runs enable row level security;
-- Supabase grants new tables to its public roles by default; take that back, as for every other table.
revoke all on table public.product_offers from anon, authenticated;
revoke all on table public.ai_recommendation_runs from anon, authenticated;
