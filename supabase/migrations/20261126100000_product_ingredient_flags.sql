-- Ingredient flags from the AI service (contract 1.1): fragrance, retinol, exfoliating acids and essential oils, read from
-- the full ingredient list when the store gives one, otherwise from the product name and description. Stored as Clara's
-- avoid-list codes (fragrance, retinol, essential_oils, exfoliating_acid).
alter table public.products
  add column ingredient_flags text[] not null default '{}',
  add column ingredient_flags_basis varchar(32),
  add constraint products_ingredient_flags_basis_check
    check (ingredient_flags_basis is null or ingredient_flags_basis in ('ingredient_list', 'name_and_description'));

comment on column public.products.ingredient_flags is
  'Avoid-list codes the AI service flagged. With basis name_and_description a missing code does not prove it is absent.';
