-- Face photos kept to train Clara's skin model.
--
-- * A separate consent, ai_model_training: a photo is only stored when the person opted in to this, on top of
--   facial_image_processing. Withdrawing it stops new uploads.
-- * A private bucket, scan-photos: no public access and no policies, so only the API (with the secret key) can
--   read or write it. Uploads go through short-lived signed links the API hands out.
-- * scan_images.quality: the photo checks the phone measured (sharpness, face size, head turn and tilt...), so
--   training photos can be filtered by quality later.

alter type public.consent_purpose add value if not exists 'ai_model_training';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-photos', 'scan-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.scan_images add column if not exists quality jsonb;

comment on column public.scan_images.quality is
  'Photo checks measured on the phone: detector_score, other_faces, face_width_ratio, face_pixels, sharpness, yaw, roll_degrees, cut_off, rotation.';
