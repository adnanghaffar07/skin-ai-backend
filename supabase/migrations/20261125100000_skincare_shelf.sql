-- "My Skincare Shelf": products the person already owns (onboarding spec, screens 06 and 07). Either a catalogue
-- product (product_id) or one typed in from elsewhere (name and brand). The routine uses it to show which steps are
-- already covered and which products are missing. Deleting the account deletes the shelf.

create table public.user_shelf_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name varchar(160) not null,
  brand varchar(120),
  category_code varchar(32) not null,
  note varchar(300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_shelf_items_category_check check (category_code in ('cleansers', 'moisturizers', 'serums', 'sunscreens', 'exfoliants', 'other'))
);

create index user_shelf_items_user_idx on public.user_shelf_items (user_id, created_at desc);
-- A catalogue product is on a shelf once.
create unique index user_shelf_items_product_idx on public.user_shelf_items (user_id, product_id) where product_id is not null;

create trigger user_shelf_items_set_updated_at
  before update on public.user_shelf_items
  for each row execute function public.set_updated_at();

alter table public.user_shelf_items enable row level security;
revoke all on table public.user_shelf_items from anon, authenticated;
