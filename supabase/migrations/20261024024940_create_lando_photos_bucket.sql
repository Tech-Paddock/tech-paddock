-- A private Storage bucket for Lando's health photos (TEC-137).
--
-- Additive: one row in storage.buckets, so it goes through the connector at
-- merge like any other migration (no DROP). Apply before the app code that
-- uploads merges, or every photo upload fails and the form keeps the photo on
-- screen with its Retry.
--
-- Private: `public` is false, and storage.objects has row level security on
-- with no policy for this bucket, so nothing reads or writes it but the
-- service role. The app uploads through its own server route
-- (`/api/photos`) and shows photos through signed URLs; an event stores only
-- the object's path. The phone shrinks each photo before upload; the limits
-- below are a backstop, not the plan (Vercel refuses bodies over about 4.5MB).
--
-- Same shape as the `coffee-files` bucket in `coffee_schema`, plus the limits.
-- Undo: delete the bucket in the dashboard once it is empty.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lando-photos', 'lando-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
