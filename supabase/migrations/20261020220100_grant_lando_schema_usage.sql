-- Grants for the `lando` schema — and this one is not optional.
--
-- 20260910051549 hardcoded four schema names and predates coffee, health,
-- cookbook and this one, so a new schema arrives with **no USAGE at all**. Every
-- query from the app then fails on permissions, which reads as a bad service key
-- and is not one. `20260911202901` (coffee), `20260918140405` (health) and
-- `20260920022508` (cookbook) are the same migration; this is a copy of the last.
--
-- ALTER DEFAULT PRIVILEGES only covers tables created *after* it runs, which is
-- why it is here before the first table: every table in `lando` inherits these
-- grants without anyone remembering to ask.
--
-- **Still outside this file and still required:** adding `lando` to the
-- exposed-schemas list in the Supabase dashboard. It is not in this repo and
-- has no migration. `/api/health` in this app probes for it and says so by name.
--
-- **Shape: additive.** Grants only; no existing object is modified.

GRANT USAGE ON SCHEMA lando TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA lando TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA lando GRANT ALL ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
