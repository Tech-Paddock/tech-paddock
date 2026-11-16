-- Grants for the `grid` schema — and this one is not optional.
--
-- A new schema arrives with **no USAGE at all** for the API roles, and every
-- query from the app then fails on permissions, which reads as a bad service
-- key and is not one (supabase/README.md, "A new schema inherits nothing").
-- Copied from `20260920022508_grant_cookbook_schema_usage`, with the name
-- changed.
--
-- The default privileges cover tables created after them; the tables already
-- made by `create_grid_schema` get the explicit GRANT. RLS is on for all of
-- them with no policy, which is the control between `anon` and the data.
--
-- **Still outside this file and still required:** adding `grid` to the
-- exposed-schemas list in the Supabase dashboard (Project Settings → API). It
-- is not in this repo. Missing it fails as `Invalid schema: grid`, which looks
-- like a credentials problem; `/api/health` in this app probes for it.
--
-- **Shape: additive.** Grants only; no existing object is modified.

GRANT USAGE ON SCHEMA grid TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA grid TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA grid GRANT ALL ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
