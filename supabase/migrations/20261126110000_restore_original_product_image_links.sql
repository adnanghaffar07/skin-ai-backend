-- Shopify's terms do not allow re-hosting product photos: point every copied photo back at the store's own address.
-- (Applied after the nightly photo copy was removed, so it is not copied again.)
update public.product_media
set url = source_url, source_url = null, copied_at = null, copy_failed_at = null
where source_url is not null and url like '%supabase.co%';
