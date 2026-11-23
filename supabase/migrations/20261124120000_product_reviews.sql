-- Product reviews written in the app: one per person per product (writing again replaces it), plus "helpful" votes.
-- Shown with the author's first name and last initial only. Deleting an account deletes its reviews and votes.

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  rating smallint not null,
  body varchar(1000) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id),
  constraint product_reviews_rating_check check (rating between 1 and 5)
);

create index product_reviews_product_time_idx on public.product_reviews (product_id, created_at desc);

create table public.product_review_votes (
  review_id uuid not null references public.product_reviews (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

alter table public.product_reviews enable row level security;
alter table public.product_review_votes enable row level security;
revoke all on table public.product_reviews from anon, authenticated;
revoke all on table public.product_review_votes from anon, authenticated;
