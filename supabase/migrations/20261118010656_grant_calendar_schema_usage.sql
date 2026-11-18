-- Grants for the `calendar` schema — and this one is not optional.
--
-- A new schema arrives with **no USAGE at all** for the API roles, and every
-- query from Grid's calendar client then fails on permissions, which reads as a
-- bad service key and is not one (supabase/README.md, "A new schema inherits
-- nothing"). Copied from `20260920022508_grant_cookbook_schema_usage`, with the
-- name changed.
--
-- The default privileges cover tables created after them; the tables already
-- made by `create_calendar_schema` get the explicit GRANT. RLS is on for all of
-- them with no policy, which is the control between `anon` and the data (the
-- connection table holds a refresh token).
--
-- **Still outside this file and still required:** adding `calendar` to the
-- exposed-schemas list in the Supabase dashboard (Project Settings -> API); it
-- is not in this repo (paddock-issues #69). Missing it fails as `Invalid schema:
-- calendar`, which looks like a credentials problem; Grid's /more page and
-- GET /api/calendar/status say so.
--
-- **Shape: additive.** Grants only; no existing object is modified.

GRANT USAGE ON SCHEMA calendar TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA calendar TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA calendar GRANT ALL ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
