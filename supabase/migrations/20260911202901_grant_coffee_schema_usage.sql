-- The coffee schema needs the same API-role grants every other schema got in
-- 20260910051549. That migration hardcoded four schema names and predates
-- coffee, so a fifth schema arrives with no USAGE at all and every query from
-- the app fails on permissions rather than on anything visible in the code.
--
-- ALTER DEFAULT PRIVILEGES only covers tables created after it runs, so the
-- existing bags table is granted explicitly as well.

GRANT USAGE ON SCHEMA coffee TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA coffee TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA coffee GRANT ALL ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
