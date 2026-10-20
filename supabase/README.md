# Supabase

One project (`qyclakzsupyxgnqfgpiq`, `tech-paddock`) backs every app. Each tool has its own schema —
`resume`, `coffee`, `health`, `cookbook` — never `public`. One
migration history, here at the repo root.

## History

The directory is the list; each file's header says what it does. What the files cannot say:

- The first migrations were applied directly and checked in afterwards, copied verbatim from
  `supabase_migrations.schema_migrations`. From `20260911202805` on, files are written first and
  applied second.
- `20260906152749` created four tables before `20260910051549` set default privileges; their grants
  were applied outside the history. `record_original_table_grants` records them.
- **Recorded versions win over filenames.** The hosted API stamps its own version; when a file's
  name differs from what ran, the file is renamed, never the database. The database records what
  ran; the repo records intent. `supabase migration repair` is never used.
- The hosted API strips the leading comment block, so each migration's reasoning lives only here.

### The withheld seed

`20260908235234_seed_contacts_threads_style_guide` is **not in this directory and must not be
added.** It is real contacts, and the no-personal-information rule applies to migrations.

- `supabase migration list` always shows it remote-only. **It must be the only difference**, apart
  from a migration awaiting merge. Anything else is drift; investigate it.
- **Never run `supabase migration repair` on it.**
- A rebuild from these files produces production's schema and table grants. Replay as `postgres` (the default privileges are its). Seeding is off in
  `config.toml`. A rebuild cannot restore the dashboard's exposed-schemas list (below).

## Working with it

The CLI runs through `npx` (no root `package.json`):

```bash
npx supabase@latest link --project-ref qyclakzsupyxgnqfgpiq   # once, needs an access token
npx supabase@latest migration list                            # local vs remote
npx supabase@latest db pull -f <name>                         # capture remote drift as a file
```

`link` writes to the gitignored `supabase/.temp/`. **Every schema change gets a file here and a pull
request.** If the database changes first, `db pull` it back immediately.

`config.toml` is the default with two edits: seeding off, and `[api] schemas` listing the custom
schemas. **Add a new schema there too**, or the local API cannot see its tables. It configures the
local stack only.

## Applying a migration

**`supabase db push` cannot work here:** it refuses while the remote holds a version the directory
lacks, and the withheld seed always is one.

Deployment applies migrations through the hosted API (`apply_migration`) at merge time, before merging,
via the `merge` skill. Then:

1. Read `supabase_migrations.schema_migrations` back.
2. If the recorded version differs from the filename, rename the file on the branch before merging.
3. Confirm local and remote differ by exactly the withheld version.

A matching version is something to read back, never to assume.

## A new schema inherits nothing

`20260910051549` granted USAGE to the schemas that existed then. A new schema has no USAGE for the
API roles, and queries fail on permissions. `ALTER DEFAULT PRIVILEGES` covers only tables created
after it, so existing tables also need `GRANT ... ON ALL TABLES`.

**Adding a schema is three steps:**

1. A migration creating the schema (alone is best, so every table inherits step 2's defaults).
2. A grants migration: copy `20260920022508_grant_cookbook_schema_usage.sql` and change the name.
3. **Dashboard: Project Settings → API → Exposed schemas.** PostgREST answers only for listed
   schemas, and the setting is not in this repo. Missing it fails as `Invalid schema: <name>`,
   which looks like a credentials problem.

**Checking exposure without the dashboard:** `postgrest_logs` reports the relation count on each
reload; a 200 for the schema in `edge_logs`; or the app's `/api/health`, which probes a real table.

## Grants and RLS

`20260910051549`, and every later schema's grants migration, sets:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA <each> GRANT ALL ON TABLES TO anon, authenticated, service_role;
```

Every new table is granted to `anon`, including DELETE and TRUNCATE. (The `20260906152749` tables
hold SELECT, INSERT, UPDATE and DELETE only.) **RLS is the only control between a leaked publishable
key and the data.** Every table has RLS enabled with zero policies (deny-by-default); the advisor's
`rls_enabled_no_policy` notices are the design working.

**Enable RLS in the same migration that creates a table.**
