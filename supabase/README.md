# Supabase

One project (`qyclakzsupyxgnqfgpiq`, `tech-paddock`) backs every app. Each tool has its own schema —
`shared`, `editor`, `tracker`, `resume`, `coffee`, `health`, `cookbook` — never `public`. One
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
- A rebuild from these files produces production's schema and table grants with an empty
  `shared.contacts`. Replay as `postgres` (the default privileges are its). Seeding is off in
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

## `shared.contacts` — write contract

Shared by two apps, so these rules change only as a cross-schema contract.

| | Who | What the code does |
|---|---|---|
| **Insert** | Message Editor only — `POST /api/contacts` | `name` required; `org`, `position`, `relationship_type`, `preferred_channel`, `notes` optional, null when absent |
| **Update** | Message Editor only — `PATCH /api/contacts/[id]` | Writes the request body as sent, plus `updated_at`. No column allowlist. No UI calls it |
| **Delete** | Message Editor only — `DELETE /api/contacts/[id]` | Hard delete. No UI calls it |
| **Read** | Editor (`/api/contacts`, `/api/draft`); Tracker (`/api/contacts`, thread draft, `lib/followUpTask.ts`, `lib/dashboard.ts`) | Read-only |
| **Reference** | `editor.message_history.contact_id`, `tracker.pipeline_threads.contact_id` | Foreign keys, `ON DELETE NO ACTION` |

- **Nothing prevents duplicates.** Primary key only; no unique index or trigger. The editor inserts
  without checking or trimming. Adding a unique key is a decision, not a fix.
- **A referenced contact cannot be deleted:** both foreign keys are `NO ACTION`, so the route
  returns 500.
- **`updated_at` moves only through the editor's PATCH;** there is no trigger.
- **The tracker and Resume Formatter never write this table;** they only store or pass `contact_id`.
- **The only create path is in the parked editor;** production runs its last good build.
- **A new write path anywhere changes this contract:** it goes to the owner through the TD, and this
  section changes in the same pull request.

## `tracker.pipeline_threads` — write contract

Owned by the Pipeline Tracker (parked; rules in `apps/home/RULES.md`), also written by the Resume
Formatter.

| | Who | What the code does |
|---|---|---|
| **Insert** | Tracker — `POST /api/threads` | `company` unvalidated (a missing one is a 500); `stage` defaults to `Applied`, `last_touch_date` to today in UTC; `contact_id`, `next_action`, `notes` null when absent |
| **Insert** | Resume — `PATCH /api/renders/[id]` with a company and no thread yet | `company`, `stage` `Applied`, `last_touch_date`, `next_action` `Follow up`, `notes` "*date* — resume sent" plus role and posting URL, `contact_id` (the UI never sends one) |
| **Update** | Tracker — `PATCH /api/threads/[id]` | The request body as sent, plus `open_task_id = null` and `updated_at`. No column allowlist |
| **Update** | Tracker — `lib/followUpTask.ts` | `open_task_id` only, after the To Do task exists |
| **Update** | Resume — `PATCH /api/renders/[id]` on an existing thread (the render's, or one named in the body) | `company`, `last_touch_date`, `notes` (appended), `open_task_id = null`, `updated_at`, and `contact_id` only when sent |
| **Delete** | Tracker — `DELETE /api/threads/[id]` | Hard delete; the renders that pointed at it keep their rows with `thread_id` null |
| **Read** | Tracker (`/api/threads`, thread draft, dashboard, follow-up task); Resume (`/api/renders`, `/api/resumes`: `id, company, stage`) | Read-only |
| **Reference** | `resume.renders.thread_id`, across schemas | Foreign key, `ON DELETE SET NULL`; `contact_id` → `shared.contacts`, `NO ACTION` |

- **Resume's write-through is not atomic.** It writes the thread, then links the render; a failed
  link plus a retry creates a second thread. The notes merge is read-then-write, so a concurrent
  tracker edit is lost.
- **`stage` has a check constraint and no default;** every writer sets it. **`updated_at` has no
  trigger;** it moves on the two PATCH paths only, and nothing reads it.
- **The tracker reads `editor.message_history`, `resume.renders` and `resume.templates`** for its
  dashboard (`lib/dashboard.ts`). Changing those columns changes this contract.
- **A new write path anywhere changes this contract:** it goes to the owner through the TD, and this
  section changes in the same pull request.

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
