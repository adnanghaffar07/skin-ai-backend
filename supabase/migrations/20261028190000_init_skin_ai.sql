-- Clara Skin AI: onboarding and skin-dashboard schema.
-- Applied to Supabase project skin-ai. No cart, orders, or assessment rows.

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create type public.user_role as enum ('customer', 'admin');
create type public.user_status as enum ('active', 'disabled', 'deleted');
create type public.consent_purpose as enum (
  'facial_image_processing',
  'camera_access',
  'photo_library',
  'terms_of_service'
);
create type public.onboarding_session_status as enum ('active', 'completed', 'abandoned');
create type public.questionnaire_definition_status as enum ('draft', 'active', 'retired');
create type public.selection_mode as enum ('single', 'multi', 'text', 'number');
create type public.submission_status as enum ('draft', 'completed');
create type public.scan_status as enum (
  'awaiting_upload',
  'uploaded',
  'ready_for_analysis',
  'queued',
  'processing',
  'completed',
  'retake_required',
  'failed',
  'cancelled'
);
create type public.assessment_status as enum ('validated', 'rejected');
create type public.observation_evidence as enum ('model_observed', 'unknown');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.restriction_severity as enum ('exclude');
create type public.recommendation_basis as enum ('self_reported', 'assessed');
create type public.routine_status as enum ('active', 'replaced');
create type public.routine_period as enum ('morning', 'evening');
create type public.routine_step_type as enum ('cleanse', 'treat', 'nourish', 'moisturise');
create type public.ai_job_type as enum ('vision', 'rag', 'explain');
create type public.ai_job_status as enum ('queued', 'processing', 'succeeded', 'failed');
create type public.knowledge_status as enum ('draft', 'approved', 'retired');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext unique,
  role public.user_role not null default 'customer',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name varchar(80),
  birth_date date,
  state_province varchar(80),
  address_line varchar(200),
  avatar_object_key varchar(512),
  market_code char(2),
  locale varchar(16) not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_market_code_check
    check (market_code is null or market_code ~ '^[A-Z]{2}$')
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  purpose public.consent_purpose not null,
  policy_version varchar(32) not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source varchar(64) not null,
  metadata jsonb not null default '{}'::jsonb
);

create index consent_records_user_purpose_idx
  on public.consent_records (user_id, purpose, granted_at desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id) on delete set null,
  action varchar(64) not null,
  entity_type varchar(64) not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  claim_token_hash varchar(64),
  status public.onboarding_session_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questionnaire_definitions (
  id uuid primary key default gen_random_uuid(),
  key varchar(64) not null,
  version integer not null,
  status public.questionnaire_definition_status not null default 'draft',
  locale varchar(16) not null default 'en',
  title varchar(120) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, version)
);

create unique index questionnaire_definitions_one_active
  on public.questionnaire_definitions (key)
  where status = 'active';

create table public.questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.questionnaire_definitions (id) on delete cascade,
  key varchar(64) not null,
  position integer not null,
  prompt text not null,
  help_text text,
  selection_mode public.selection_mode not null,
  required boolean not null default true,
  min_selections integer,
  max_selections integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (definition_id, key),
  unique (definition_id, position),
  constraint questionnaire_questions_selection_bounds_check
    check (
      (min_selections is null or min_selections >= 0)
      and (max_selections is null or max_selections >= 1)
      and (
        min_selections is null
        or max_selections is null
        or min_selections <= max_selections
      )
    )
);

create table public.questionnaire_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questionnaire_questions (id) on delete cascade,
  code varchar(64) not null,
  label varchar(160) not null,
  position integer not null,
  metadata jsonb,
  unique (question_id, code),
  unique (question_id, position)
);

create table public.questionnaire_submissions (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.questionnaire_definitions (id) on delete restrict,
  onboarding_session_id uuid not null references public.onboarding_sessions (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  status public.submission_status not null default 'draft',
  definition_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index questionnaire_submissions_one_draft
  on public.questionnaire_submissions (onboarding_session_id)
  where status = 'draft';

create index questionnaire_submissions_user_idx
  on public.questionnaire_submissions (user_id, status, completed_at desc);

create table public.questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.questionnaire_submissions (id) on delete cascade,
  question_id uuid not null references public.questionnaire_questions (id) on delete restrict,
  option_id uuid references public.questionnaire_options (id) on delete restrict,
  text_value text,
  numeric_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id, option_id)
);

create table public.skin_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  source_submission_id uuid not null references public.questionnaire_submissions (id) on delete restrict,
  age_range varchar(32),
  self_reported_skin_type varchar(32),
  sensitivity_level varchar(32),
  current_routine_level varchar(32),
  reaction_history varchar(32),
  updated_at timestamptz not null default now()
);

create table public.skin_profile_concerns (
  user_id uuid not null references public.users (id) on delete cascade,
  concern_code varchar(64) not null,
  primary key (user_id, concern_code)
);

create table public.skin_profile_sensitivities (
  user_id uuid not null references public.users (id) on delete cascade,
  sensitivity_code varchar(64) not null,
  primary key (user_id, sensitivity_code)
);

create table public.user_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  primary_goal varchar(64),
  monthly_budget_band varchar(32),
  morning_time time,
  evening_time time,
  next_scan_on date,
  source_submission_id uuid references public.questionnaire_submissions (id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.user_preference_categories (
  user_id uuid not null references public.users (id) on delete cascade,
  category_code varchar(32) not null,
  primary key (user_id, category_code)
);

create table public.user_preference_goals (
  user_id uuid not null references public.users (id) on delete cascade,
  goal_code varchar(64) not null,
  primary key (user_id, goal_code)
);

create table public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  submission_id uuid references public.questionnaire_submissions (id) on delete restrict,
  consent_id uuid not null references public.consent_records (id) on delete restrict,
  status public.scan_status not null default 'awaiting_upload',
  idempotency_key varchar(64),
  failure_code varchar(64),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index scan_sessions_idempotency_idx
  on public.scan_sessions (user_id, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index scan_sessions_user_created_idx
  on public.scan_sessions (user_id, created_at desc)
  where deleted_at is null;

create table public.scan_images (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scan_sessions (id) on delete cascade,
  storage_provider varchar(16) not null default 'r2',
  bucket varchar(128) not null,
  object_key varchar(512) not null,
  content_type varchar(64) not null,
  byte_size integer not null,
  checksum_sha256 char(64),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint scan_images_content_type_check
    check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint scan_images_byte_size_check
    check (byte_size > 0 and byte_size <= 8388608)
);

create table public.skin_assessments (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scan_sessions (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete cascade,
  status public.assessment_status not null,
  summary text,
  limitations text[] not null default '{}',
  schema_version varchar(16) not null,
  model_version varchar(64),
  prompt_version varchar(64),
  created_at timestamptz not null default now()
);

create table public.assessment_observations (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.skin_assessments (id) on delete cascade,
  feature_code varchar(64) not null,
  intensity varchar(32),
  location_note varchar(120),
  score smallint,
  confidence numeric(4, 3),
  evidence public.observation_evidence not null default 'model_observed',
  unique (assessment_id, feature_code),
  constraint assessment_observations_score_check
    check (score is null or score between 0 and 100),
  constraint assessment_observations_confidence_check
    check (confidence is null or confidence between 0 and 1)
);

create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  scan_id uuid not null unique references public.scan_sessions (id) on delete restrict,
  captured_on date not null,
  overall_score smallint,
  created_at timestamptz not null default now(),
  constraint progress_entries_score_check
    check (overall_score is null or overall_score between 0 and 100)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name varchar(160) not null,
  slug varchar(120) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_categories (
  code varchar(32) primary key,
  name varchar(80) not null,
  position integer not null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete restrict,
  category_code varchar(32) not null references public.product_categories (code) on delete restrict,
  slug varchar(120) not null unique,
  name varchar(160) not null,
  description text,
  benefits text,
  how_to_use text,
  suitable_for text,
  cautions text,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index products_name_trgm_idx
  on public.products using gin (name extensions.gin_trgm_ops);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  alt_text varchar(160),
  position integer not null default 0
);

create table public.product_market_availability (
  product_id uuid not null references public.products (id) on delete cascade,
  market_code char(2) not null,
  badge_code varchar(8),
  is_available boolean not null default true,
  primary key (product_id, market_code),
  constraint product_market_code_check check (market_code ~ '^[A-Z]{2}$')
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku varchar(64) not null unique,
  name varchar(160) not null,
  status public.product_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  market_code char(2) not null,
  currency_code char(3) not null,
  amount numeric(12, 2) not null,
  compare_at_amount numeric(12, 2),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  constraint product_prices_market_check check (market_code ~ '^[A-Z]{2}$'),
  constraint product_prices_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint product_prices_amount_check check (amount >= 0),
  constraint product_prices_compare_check
    check (compare_at_amount is null or compare_at_amount >= 0)
);

create index product_prices_lookup_idx
  on public.product_prices (variant_id, market_code, effective_from desc);

create table public.product_rating_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  rating_avg numeric(2, 1) not null,
  rating_count integer not null,
  captured_at timestamptz not null default now(),
  constraint product_rating_avg_check check (rating_avg between 0 and 5),
  constraint product_rating_count_check check (rating_count >= 0)
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  inci_name varchar(160) not null unique,
  display_name varchar(160) not null,
  slug varchar(120) not null unique
);

create table public.ingredient_restrictions (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  restriction_code varchar(64) not null,
  severity public.restriction_severity not null default 'exclude',
  unique (ingredient_id, restriction_code)
);

create table public.product_ingredients (
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  position integer not null default 0,
  is_highlighted boolean not null default false,
  primary key (product_id, ingredient_id)
);

create table public.recommendation_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  scan_id uuid references public.scan_sessions (id) on delete restrict,
  submission_id uuid not null references public.questionnaire_submissions (id) on delete restrict,
  basis public.recommendation_basis not null,
  rule_version varchar(32) not null,
  market_code char(2) not null,
  created_at timestamptz not null default now(),
  constraint recommendation_sets_market_check check (market_code ~ '^[A-Z]{2}$')
);

create table public.recommendation_items (
  id uuid primary key default gen_random_uuid(),
  recommendation_set_id uuid not null references public.recommendation_sets (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  rank integer not null,
  currency_code char(3) not null,
  amount numeric(12, 2) not null,
  reason_codes text[] not null default '{}',
  explanation text,
  constraint recommendation_items_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint recommendation_items_amount_check check (amount >= 0)
);

create table public.skincare_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  recommendation_set_id uuid not null references public.recommendation_sets (id) on delete restrict,
  version integer not null,
  status public.routine_status not null default 'active',
  routine_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

create table public.skincare_routine_steps (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.skincare_routines (id) on delete cascade,
  period public.routine_period not null,
  position integer not null,
  product_id uuid references public.products (id) on delete restrict,
  step_type public.routine_step_type not null,
  title varchar(80) not null,
  amount_label varchar(80),
  duration_label varchar(80),
  instruction text,
  unique (routine_id, period, position)
);

create table public.routine_step_completions (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.skincare_routine_steps (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  completed_on date not null,
  completed_at timestamptz not null default now(),
  unique (step_id, completed_on)
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scan_sessions (id) on delete cascade,
  job_type public.ai_job_type not null,
  status public.ai_job_status not null default 'queued',
  attempt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_processing_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  provider varchar(64) not null,
  model_version varchar(64),
  prompt_version varchar(64),
  schema_version varchar(16) not null,
  provider_payload jsonb,
  created_at timestamptz not null default now()
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title varchar(200) not null,
  source_uri text,
  version varchar(32) not null,
  locale varchar(16) not null default 'en',
  status public.knowledge_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  ordinal integer not null,
  content text not null,
  citation_label varchar(160),
  unique (document_id, ordinal)
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();
create trigger onboarding_sessions_set_updated_at
  before update on public.onboarding_sessions
  for each row execute function public.set_updated_at();
create trigger questionnaire_definitions_set_updated_at
  before update on public.questionnaire_definitions
  for each row execute function public.set_updated_at();
create trigger questionnaire_questions_set_updated_at
  before update on public.questionnaire_questions
  for each row execute function public.set_updated_at();
create trigger questionnaire_submissions_set_updated_at
  before update on public.questionnaire_submissions
  for each row execute function public.set_updated_at();
create trigger questionnaire_answers_set_updated_at
  before update on public.questionnaire_answers
  for each row execute function public.set_updated_at();
create trigger skin_profiles_set_updated_at
  before update on public.skin_profiles
  for each row execute function public.set_updated_at();
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();
create trigger scan_sessions_set_updated_at
  before update on public.scan_sessions
  for each row execute function public.set_updated_at();
create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();
create trigger ai_jobs_set_updated_at
  before update on public.ai_jobs
  for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;
