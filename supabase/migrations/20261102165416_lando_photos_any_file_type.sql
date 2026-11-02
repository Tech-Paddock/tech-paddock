-- Lando's attachment bucket takes any file type (TEC-203).
--
-- **Shape: additive.** One row of storage.buckets is updated: `allowed_mime_types` goes from the three image
-- types to null (any type), which widens what the bucket accepts and removes nothing. It stays private
-- (`public` false, no policy on storage.objects for this bucket, so only the service role reads or writes it)
-- and keeps its 4 MB `file_size_limit` (Vercel refuses request bodies over about 4.5 MB). Photos are still
-- shrunk on the phone; a PDF or other file goes up as it is, up to the limit. The app writes only through
-- `/api/photos` and shows files through short-lived signed URLs.
--
-- **How this is applied.** Through the connector (`apply_migration`), by Deployment, before the merge. Skipped,
-- every non-image upload is refused by the bucket and the form keeps that file on screen with its Retry.
-- Read back: `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'lando-photos'`
-- gives `false`, 4194304 and null.
-- Undo: set `allowed_mime_types` back to `array['image/jpeg', 'image/png', 'image/webp']`; objects already
-- stored stay (nothing is ever deleted from the bucket).

update storage.buckets
set allowed_mime_types = null
where id = 'lando-photos';
