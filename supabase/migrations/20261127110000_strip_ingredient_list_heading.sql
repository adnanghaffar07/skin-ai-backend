-- A store heading was read as part of the first ingredient ("Ingredients Water (Aqua/Eau)"). Products now point at the
-- ingredient without the heading, and the headed entry is removed. New lists lose the heading when the AI answer is read.
with headed as (
  select i.id as old_id,
         trim(regexp_replace(i.inci_name, '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)', '', 'i')) as clean_name
  from public.ingredients i
  where i.inci_name ~* '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)'
),
target as (
  select h.old_id, c.id as new_id
  from headed h join public.ingredients c on c.inci_name = h.clean_name
)
update public.product_ingredients pi
set ingredient_id = t.new_id
from target t
where pi.ingredient_id = t.old_id
  and not exists (
    select 1 from public.product_ingredients other where other.product_id = pi.product_id and other.ingredient_id = t.new_id
  );

-- Where no clean ingredient exists yet, the headed one is renamed instead.
update public.ingredients i
set inci_name = trim(regexp_replace(i.inci_name, '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)', '', 'i')),
    display_name = trim(regexp_replace(i.display_name, '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)', '', 'i'))
where i.inci_name ~* '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)'
  and not exists (
    select 1 from public.ingredients c
    where c.inci_name = trim(regexp_replace(i.inci_name, '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)', '', 'i'))
  );

delete from public.product_ingredients pi
using public.ingredients i
where pi.ingredient_id = i.id
  and i.inci_name ~* '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)';

delete from public.ingredient_restrictions r
using public.ingredients i
where r.ingredient_id = i.id
  and i.inci_name ~* '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)';

delete from public.ingredients i
where i.inci_name ~* '^((full|active|inactive|other)\s+)?ingredients?(\s*[:\-–]\s*|\s+|$)';
