-- POST /recommendations requires Idempotency-Key; the same key and user return the original set.
alter table public.recommendation_sets
  add column idempotency_key varchar(64),
  add column limitations text[] not null default '{}';

create unique index recommendation_sets_idempotency_idx
  on public.recommendation_sets (user_id, idempotency_key)
  where idempotency_key is not null;
