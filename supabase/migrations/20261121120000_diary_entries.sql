-- Skin diary: one entry per person per day (their own calendar day, sent by the app).
-- Covers the spec's daily entry: comfort, concerns, routine done, new products, reactions and notes.
-- Progress photos wait for the photo storage decision.

create type public.diary_reaction as enum ('none', 'mild', 'severe');

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  entry_date date not null,
  skin_feel smallint,
  concerns text[] not null default '{}',
  morning_routine_done boolean,
  evening_routine_done boolean,
  new_products varchar(300),
  reaction public.diary_reaction,
  reaction_note varchar(500),
  notes varchar(1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date),
  constraint diary_entries_feel_check check (skin_feel is null or skin_feel between 1 and 5)
);

alter table public.diary_entries enable row level security;
revoke all on table public.diary_entries from anon, authenticated;
