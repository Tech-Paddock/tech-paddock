-- Grants for the `cookbook` schema — and this one is not optional.
--
-- 20260910051549 hardcoded four schema names and predates coffee, health and
-- this one, so a new schema arrives with **no USAGE at all**. Every query from
-- the app then fails on permissions, which reads as a bad service key and is
-- not one. `20260911202901` (coffee) and `20260918140405` (health) are the same
-- migration, each written after exactly that confusion.
--
-- ALTER DEFAULT PRIVILEGES only covers tables created *after* it runs, which is
-- why it is here on day one rather than alongside the first table: every table
-- the Cookbook agent creates from now on inherits these grants without anyone
-- remembering to ask.
--
-- **Still outside this file and still required:** adding `cookbook` to the
-- exposed-schemas list in the Supabase dashboard. It is not in this repo, it
-- has no migration, and the standup protocol names it as the step that gets
-- missed. It cost `coffee` an hour on 2026-09-12 with the key suspected the
-- whole time. `/api/health` in this app probes for it and says so by name.
--
-- **Shape: additive.** Grants only; no existing object is modified.

GRANT USAGE ON SCHEMA cookbook TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA cookbook TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA cookbook GRANT ALL ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
