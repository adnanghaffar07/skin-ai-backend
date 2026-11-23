-- Pictures people add to their account, starting with the profile photo.
--
-- * A private bucket, user-media: no public access and no policies, like scan-photos. The API hands out short-lived
--   signed links to upload and to view. Kept apart from scan-photos, which only holds photos kept for training.
-- * user_profiles.avatar_object_key: where the profile photo is in that bucket (users/<user id>/avatar-<time>.<ext>).
--   Account deletion removes the object first, then the row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-media', 'user-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.user_profiles add column if not exists avatar_object_key text;

comment on column public.user_profiles.avatar_object_key is
  'Profile photo in the private user-media bucket (users/<user id>/avatar-<time>.<ext>); shown through a signed link.';
