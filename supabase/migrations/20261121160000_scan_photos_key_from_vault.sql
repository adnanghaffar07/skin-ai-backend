-- The API reads the Supabase secret key for the private scan-photos bucket from Supabase Vault, so it does not have
-- to be set in Vercel. The key is added once in the dashboard (Project Settings -> Vault) under the name
-- scan_photos_secret_key; it is never in git.
--
-- clara_api cannot read Vault itself. This function returns that one secret and nothing else, and only clara_api
-- may call it (not the app's anon or signed-in roles, so it is not reachable through the public REST API).

create or replace function public.scan_photos_storage_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'scan_photos_secret_key'
  limit 1;
$$;

revoke all on function public.scan_photos_storage_key() from public, anon, authenticated;
grant execute on function public.scan_photos_storage_key() to clara_api;
