-- The wishlist and cart, kept on the account so they follow the person to another phone. One row per person; the
-- app replaces both lists together. Product ids only: prices and names always come from the catalogue.

create table public.user_saved_lists (
  user_id uuid primary key references public.users (id) on delete cascade,
  wishlist jsonb not null default '[]',
  cart jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.user_saved_lists enable row level security;
revoke all on table public.user_saved_lists from anon, authenticated;
