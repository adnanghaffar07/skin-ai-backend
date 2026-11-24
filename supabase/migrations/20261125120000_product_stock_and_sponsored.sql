-- Product page and shop labels (onboarding spec, screen 08): stock comes from the store offers Clara buys from, and a
-- paid placement is marked so it is never mistaken for a match chosen for the person. No product is sponsored today;
-- the Clara team sets the flag when a paid placement starts.

alter table public.products add column is_sponsored boolean not null default false;
