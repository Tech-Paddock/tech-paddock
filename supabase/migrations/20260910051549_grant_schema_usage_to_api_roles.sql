GRANT USAGE ON SCHEMA editor, shared, tracker, resume TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA editor GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA shared GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracker GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA resume GRANT ALL ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
