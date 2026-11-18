-- Dedicated database login for the API, so it does not run as the postgres admin account.
-- It can read and write application data but cannot change the schema or manage roles.
-- The API enforces per-user access itself, so the role bypasses row level security.
-- No password is stored here: it can only log in once one is set outside version control.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_api') then
    create role clara_api login bypassrls nocreatedb nocreaterole connection limit 30;
  end if;
end $$;

alter role clara_api set search_path = public, extensions;

grant usage on schema public, extensions to clara_api;
grant select, insert, update, delete on all tables in schema public to clara_api;
grant usage, select on all sequences in schema public to clara_api;

-- Tables added by later migrations get the same access automatically.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to clara_api;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to clara_api;
