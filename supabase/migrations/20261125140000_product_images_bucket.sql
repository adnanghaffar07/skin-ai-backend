-- Product photos kept in Clara's own storage instead of loading from brand websites, which can move or block them.
-- A public bucket: product photos are not personal, and the app loads them directly. Only the API writes to it.
-- product_media.source_url keeps where each photo was copied from; url then points at the copy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.product_media add column if not exists source_url text;
alter table public.product_media add column if not exists copied_at timestamptz;
-- Set when copying failed, so the daily job does not retry a dead link every day.
alter table public.product_media add column if not exists copy_failed_at timestamptz;
