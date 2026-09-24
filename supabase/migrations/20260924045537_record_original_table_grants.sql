-- Record the grants the four original tables have always had in production,
-- and that no migration in this directory ever wrote down.
--
-- **Shape: additive, and a no-op on production.** Every GRANT below already
-- holds on the live project, and granting a privilege a role already has
-- changes nothing, so it is safe to apply before or after any code. No row,
-- column, constraint, index or policy is touched.
--
-- ## Why it exists
--
-- `20260906152749` created shared.contacts, editor.message_history,
-- editor.style_guide and tracker.pipeline_threads four days before
-- `20260910051549` granted schema USAGE and set ALTER DEFAULT PRIVILEGES.
-- Default privileges only reach tables created after they are set, and
-- `20260910051549` has no `GRANT ... ON ALL TABLES`, so replaying this
-- directory into an empty project left these four tables with no grant at all
-- for anon, authenticated or service_role. Every service-role query against
-- them then fails with 42501: the Message Editor, the Pipeline Tracker, and the
-- Resume Formatter's write-through to tracker threads.
--
-- Production never failed, because the grants were applied there outside the
-- migration history. The only recorded migrations with a GRANT naming these
-- schemas are `20260910051549` and `20260910215015`, and the second covers
-- editor.model_status alone. So the database was the only record of its own
-- shape, which is the one thing this directory exists to prevent. Found by the
-- database review of 2026-09-24.
--
-- ## What was measured, and when
--
-- Read-only, on the live project, 2026-09-24, from
-- information_schema.role_table_grants and pg_class.relacl:
--
--   * each of the four tables carries exactly SELECT, INSERT, UPDATE and
--     DELETE (`arwd`) for anon, authenticated and service_role, none of them
--     grantable, granted by postgres, which owns all four;
--   * not the ALL that every later table got from default privileges: no
--     TRUNCATE, REFERENCES or TRIGGER. This file records what is there rather
--     than what would be tidier, so a rebuilt project matches production
--     exactly instead of quietly granting more;
--   * no column-level grants on any of them;
--   * no sequence in any app schema, because every key is a uuid, so there is
--     no sequence grant to record.
--
-- RLS stays enabled with zero policies on all four, as on every table here.
-- These grants reach anon, and RLS is still the only thing between a leaked
-- publishable key and the rows.
--
-- ## Deployment
--
-- Additive; applied by the technical director through the hosted API at gate
-- time, before merging. Nothing in production changes. Verify with
-- role_table_grants unchanged and exactly one remote-only version,
-- 20260908235234. Skipped, nothing breaks in production, but a rebuild from
-- this directory stays broken.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON shared.contacts, editor.message_history, editor.style_guide, tracker.pipeline_threads
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
