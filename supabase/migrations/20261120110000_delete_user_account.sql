-- Deletes one person's account and every row that belongs to them, in one transaction.
-- Some tables protect each other with RESTRICT, so dependents go first and the order below matters.
-- Audit rows stay for security review, but no longer point at the person.
-- Photos in object storage are removed by the API before it calls this function.

create or replace function public.delete_user_account(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.audit_events set actor_user_id = null where actor_user_id = target;

  delete from public.routine_step_completions where user_id = target;
  delete from public.skincare_routines where user_id = target;
  delete from public.progress_entries where user_id = target;
  delete from public.skin_assessments where user_id = target;
  delete from public.recommendation_sets where user_id = target;
  delete from public.scan_sessions where user_id = target;
  delete from public.skin_profiles where user_id = target;
  delete from public.user_preferences where user_id = target;

  -- Everything else (profile, consents, questionnaire answers, concerns, goals) cascades from here.
  delete from public.users where id = target;
  delete from auth.users where id = target;

  insert into public.audit_events (actor_user_id, action, entity_type, metadata)
  values (null, 'DELETE account', 'account', '{}'::jsonb);
end;
$$;

-- Only the API may call it. Supabase grants new functions to its public roles by default, so take that back.
revoke all on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to clara_api;
