-- Attachments on an upcoming item (TEC-203): photos and files on a plan.
--
-- **Shape: additive.** One new nullable column, no default and no rewrite of existing rows (they stay null).
-- `attachments` holds the same two keys an entry's `details` holds, `{"photos": [paths], "names": {path: name}}`:
-- the stored path of each file in the private `lando-photos` bucket, and the original name of each one that is
-- not a picture. Null when there are none. The server (`apps/lando/lib/upcoming.ts`) checks the paths and the
-- names before they are written, and a Done copies them onto the entry it creates.
--
-- The check keeps the column an object when set; the paths themselves are the server's to check (the bucket,
-- not this table, knows whether a file is there), as for `lando.events`.
--
-- **How this is applied.** Through the connector (`apply_migration`), by Deployment, before the merge. Skipped,
-- reading `lando.upcoming` fails (the app selects the column) and so does saving a plan.
-- Read back: `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'lando'
-- and table_name = 'upcoming' and column_name = 'attachments'` gives `jsonb`, `YES`.
-- Undo: drop the column, only before any plan holds a file.

set local lock_timeout = '5s';

alter table lando.upcoming
  add column attachments jsonb
  check (attachments is null or jsonb_typeof(attachments) = 'object');

notify pgrst, 'reload schema';
