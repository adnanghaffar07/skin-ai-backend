-- How bad each ticked concern was that day (onboarding spec, screen 09: "concern severity"): 1 mild, 2 moderate,
-- 3 strong, keyed by concern code. Concerns ticked without a level (older entries) have no key.

alter table public.diary_entries add column concern_levels jsonb not null default '{}';
