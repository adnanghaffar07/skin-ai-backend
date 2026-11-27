-- QA B-06: three products got "ingredients" that were fragments of page text ("formula", "makeup", "fragrance"...).
-- Their lists are removed (the ingredients become unknown, which is the truth), and so are the fragment entries.
delete from public.product_ingredients
where product_id in (
  select pi.product_id from public.product_ingredients pi
  join public.ingredients i on i.id = pi.ingredient_id
  where i.inci_name ~ '["\[\]{}]'
);

delete from public.ingredient_restrictions r
using public.ingredients i
where r.ingredient_id = i.id and i.inci_name ~ '["\[\]{}]'
  and not exists (select 1 from public.product_ingredients pi where pi.ingredient_id = i.id);

delete from public.ingredients i
where i.inci_name ~ '["\[\]{}]'
  and not exists (select 1 from public.product_ingredients pi where pi.ingredient_id = i.id);
