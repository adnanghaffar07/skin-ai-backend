-- What the AI service adds to a plan beyond the products (contract sections 4b and 4c):
-- * recommendation_sets.safety: {refer_to_professional, reason}. When true, the app shows advice to see a doctor or
--   dermatologist above the products.
-- * recommendation_items.guidance: {periods, frequency, cautions} for each product: morning/evening, how often, and
--   cautions (the product's own and ones for this person).
alter table public.recommendation_sets add column if not exists safety jsonb;
alter table public.recommendation_items add column if not exists guidance jsonb;
