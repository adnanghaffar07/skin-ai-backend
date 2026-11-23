-- Dermatologists shown on Find a dermatologist, and each person's own consultation notes.
--
-- * dermatologists: edited by the Clara team (Supabase table editor), read by the app. `active = false` hides one.
--   Booking a visit is not live yet (the app says "coming soon"), so `slot_times` is only what the page shows.
--   Seeded with the two doctors the app's design showed; replace them with real profiles before launch.
-- * consultation_notes: what a person writes down about a visit (doctor, date, title, notes, an optional photo in the
--   private user-media bucket). Deleting the account deletes them; their photos are removed first by the API.

create table public.dermatologists (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  speciality varchar(160) not null,
  focus varchar(160) not null,
  about varchar(1000) not null,
  languages text[] not null default '{}',
  rating numeric(2, 1),
  review_count integer not null default 0,
  fee_cents integer not null,
  currency char(3) not null default 'USD',
  photo_url text,
  video boolean not null default true,
  call boolean not null default true,
  slot_times text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dermatologists_rating_check check (rating is null or rating between 0 and 5),
  constraint dermatologists_fee_check check (fee_cents >= 0)
);

insert into public.dermatologists (name, speciality, focus, about, languages, rating, review_count, fee_cents, slot_times, sort_order)
values
  ('Dr. Maya Shah', 'MBBS, FCPS (Dermatology)', 'Medical & cosmetic dermatology',
   'I believe in evidence-based, personalized care that helps you achieve healthy, confident skin at every stage of life.',
   '{English,Spanish}', 4.5, 1069, 2000, '{10:30 AM,12:00 PM,2:30 PM}', 1),
  ('Dr. Emma Chen', 'Dermatologist', 'Sensitive skin and routines',
   'I help people with sensitive or reactive skin find gentle routines and products that work for them.',
   '{English}', 4.7, 412, 2500, '{9:00 AM,11:30 AM,4:00 PM}', 2);

create table public.consultation_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  dermatologist_id uuid references public.dermatologists (id) on delete set null,
  doctor_name varchar(120) not null,
  visited_on date not null,
  title varchar(120),
  notes varchar(2000) not null default '',
  photo_object_key text,
  -- A photo of the doctor the person added themselves (otherwise the dermatologist's own photo is shown).
  doctor_photo_object_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultation_notes_user_idx on public.consultation_notes (user_id, visited_on desc);

alter table public.dermatologists enable row level security;
alter table public.consultation_notes enable row level security;
revoke all on table public.dermatologists from anon, authenticated;
revoke all on table public.consultation_notes from anon, authenticated;
