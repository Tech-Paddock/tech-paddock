# Supabase

One Supabase project (`qyclakzsupyxgnqfgpiq`, `tech-paddock`) backs every app in this repo, with
each tool in its own Postgres schema — `shared`, `editor`, `tracker`, `resume`, `coffee`, `health`
and `cookbook` — and never the default `public` schema.

The migration history lives here, at the repo root, rather than under any one app. One project
means one history; splitting it per app is exactly how it drifted in the first place.

## History

**The directory is the list.** Every file's header says what it does and what shape it is; the
table that used to sit here stopped at `20260912213501` and nobody noticed. This section keeps only
what the files cannot say about themselves.

Six of the first seven migrations were applied directly to the project and only checked in
afterwards, on 2026-09-11, copied verbatim out of `supabase_migrations.schema_migrations` — so they
match what actually ran, and their file timestamps are much later than their versions. Everything
from `20260911202805` onward was written first and applied second, the order this directory exists
to enforce.

**The backfill could only copy what the history recorded.** `20260906152749` created four tables
before `20260910051549` set default privileges, and their grants were applied outside the history.
Until 2026-09-24 a rebuild gave `shared.contacts`, `editor.message_history`, `editor.style_guide`
and `tracker.pipeline_threads` no grants at all; `record_original_table_grants` wrote them down
from the live catalog.

### Renamed files, and why that is the honest direction

The hosted API stamps its own version when it runs and ignores the filename, and nothing compares
the two until you run `migration list`. Eight files reached `main` under a version that never ran
and were renamed to the one that did:

- **2026-09-14** — the four `coffee` migrations, e.g. `20260911203000_coffee_schema` became
  `20260911202805`.
- **2026-09-18** — `20260918014500_resume_renders_outlive_templates` became `20260918041216`, a day
  after it was applied at the gate (#107, renamed in #113).
- **2026-09-22** — `coffee_suggested_recipe`, `health_entries_column_comments` and
  `health_grocery_items` (TEC-13).

**Editing the database's recorded versions to match the filenames was rejected, and the reason is
worth keeping.** This directory exists so the database stops being the only record of its own
shape; it does not follow that the repo overrules the database about *what already happened*. The
database is the record of what ran; the repo is the record of what was intended. When they
disagree about history, history wins and the cheap side moves — which is also why `supabase
migration repair` was never needed, and `CLAUDE.md` forbids it.

The coffee four were verified identical statement by statement against `schema_migrations`, not
eyeballed. The hosted API strips the leading comment block, so the *reasoning* for each migration
lives in this directory and nowhere else.

### The deliberate gap

`20260908235234_seed_contacts_threads_style_guide` is **not in this directory and should not be
added.** It is data, not schema, and the data is seven real contacts — named people and named
companies. The repo's no-personal-information rule applies to migrations exactly as it applies to
docx fixtures.

- `supabase migration list` will always show `20260908235234` as present remotely and missing
  locally. That is correct and permanent, and **it must be the only difference** — measured on
  2026-09-24, just before `record_original_table_grants` was written: the remote recorded every
  file here plus that one, and nothing else. A migration awaiting its gate is the one other
  difference to expect, and only until it is applied. Anything else means something drifted and
  is worth reading rather than dismissing.
- **Do not run `supabase migration repair` on it.** It would edit the remote history to match the
  repo, falsifying the record of what was applied in order to silence a gap we chose on purpose.
- **A rebuild from these files produces production's schema and table grants, with an empty
  `shared.contacts`** — checked against `pg_class.relacl` on 2026-09-24. The default privileges
  belong to `postgres`, so replay as `postgres`, as the CLI and the hosted API both do. Seeding is
  off in `config.toml` because this withheld file is the only seed there has ever been. What a
  rebuild cannot restore is the dashboard's exposed-schemas list — below.

## Working with it

There is no root `package.json` in this repo by design, so the CLI runs through `npx`:

```bash
npx supabase@latest link --project-ref qyclakzsupyxgnqfgpiq   # one time, needs an access token
npx supabase@latest migration list                            # local vs remote
npx supabase@latest db pull -f <name>                         # capture remote drift as a new file
```

`link` writes the project ref to `supabase/.temp/`, which is gitignored; it is not in
`config.toml`. **Any schema change gets a file in this directory and goes through a pull
request.** If the database changes first, `db pull` it back immediately.

`config.toml` is the generated default with two edits: seeding is off (above), and `[api] schemas`
lists the custom schemas alongside `public`. **Add a new schema there too** — without it a local
stack serves an API that cannot see the tables. It configures the local stack only.

## How a migration actually gets applied

**`supabase db push` does not work here, and it is not going to.** It refuses when the remote
history holds a version the local directory lacks — *"Remote migration versions not found in local
migrations directory"* — and writes nothing. `20260908235234` is remote-only permanently and on
purpose, so the one condition `db push` needs is the one this project chose never to satisfy.

**So Deployment applies migrations through the hosted API** (the Supabase MCP's
`apply_migration` is the same path) **at gate time, before merging.** Not by hand in the SQL
editor, not by an app agent, and not by Joel. `CLAUDE.md` makes it a rule, alongside the shape rule
that makes applying before merging safe.

**The recorded version is not the filename's.** The API stamps the clock at the moment it runs. So
at the gate: apply, read `supabase_migrations.schema_migrations` back, and if the recorded version
differs, **rename the file on the branch to match before merging**, so `main` never carries a name
that did not run. Then confirm local and remote differ by exactly the withheld version. Gate records
for #56, #159, #161 and #165 report a version that matched its filename, while #107, #114 and #158
were stamped; how the matches happened was never written down, so a match is something to read
back, never something to plan on. Not reading back is how four `coffee` versions went unnoticed
for three days.

## A new schema does not inherit anything

`20260910051549` granted schema USAGE by naming the schemas that existed then. It cannot cover a
later schema, so **every new schema arrives with no USAGE for the API roles** and every query
against it fails on permissions — not on anything visible in the application code. `ALTER DEFAULT
PRIVILEGES` only affects tables created *after* it runs, so tables that already exist need `GRANT
... ON ALL TABLES` as well. `20260910051549` lacked that for the tables before it, which is why a
rebuild left them ungranted until `record_original_table_grants`.

**Adding a schema means two migrations and one dashboard setting — three steps, not two.**

1. The schema and its tables — or the schema alone, as `health` and `cookbook` did, so every table
   that follows inherits step 2's default privileges.
2. Its grants. Copy `20260920022508_grant_cookbook_schema_usage.sql` and change the schema name.
3. **Add it to the hosted project's exposed schemas: Project Settings → API → Exposed schemas.**
   PostgREST only answers for schemas on that list, and it is not in this repo.

Step 3 is the one that gets missed, and it fails looking like a credentials problem. **This bit on
2026-09-12:** `coffee` had a correct migration and correct grants — `service_role` had USAGE and
SELECT, verified directly — and the app still answered `Invalid schema: coffee` for an hour while
the key was suspected. Adding it in the dashboard fixed it with no code change and no redeploy;
PostgREST reloaded and logged `Schema cache loaded 8 Relations`, one more than before.

**Checking it without dashboard access.** `postgrest_logs` reports the relation count on every
reload; if it is short of the tables you expect exposed, one schema is off the list. Or find a
real request in `edge_logs`: **`health` was proven exposed on 2026-09-24 that way**, by a 200 on
`/rest/v1/entries`. **Health's and Cookbook's `/api/health` cannot answer this question.** Both
probe with `rpc("version")`, which resolves to `health.version()` or `cookbook.version()`; no app
schema holds any function, so the probe fails whether or not the schema is exposed. The fix, a
real table read like Coffee's and Resume's, is filed with those agents.

## `shared.contacts` — the write contract

A table two apps share on purpose, so the rules are a contract rather than one agent's note.
Read from the code and the live catalog on 2026-09-23 (TEC-9), not from any description of them.

| | Who | What the code does |
|---|---|---|
| **Insert** | Message Editor only — `POST /api/contacts` | `name` required; `org`, `position`, `relationship_type`, `preferred_channel`, `notes` optional, null when absent |
| **Update** | Message Editor only — `PATCH /api/contacts/[id]` | Writes the request body as sent, plus `updated_at`. No column allowlist. No UI calls it |
| **Delete** | Message Editor only — `DELETE /api/contacts/[id]` | Hard delete. No UI calls it |
| **Read** | Editor (`/api/contacts`, `/api/draft`); Tracker (`/api/contacts`, thread draft, `lib/followUpTask.ts`, `lib/dashboard.ts`) | Read-only |
| **Reference** | `editor.message_history.contact_id`, `tracker.pipeline_threads.contact_id` | Foreign keys, `ON DELETE NO ACTION` |

**Nothing prevents a duplicate.** The table has its primary key and no other constraint — no unique
index, no trigger. The editor inserts without looking first and trims nothing; its typeahead is the
only guard, and it is a person reading a list. A unique key is a schema change with real rows
behind it, so it is a decision, not a fix.

**A referenced contact cannot be deleted.** Both foreign keys are `NO ACTION`, so the delete fails
and the route returns 500. That is the safe direction — history is never orphaned — but it means
delete works only on a contact nothing points at.

**`updated_at` moves only through the editor's PATCH.** There is no trigger, so any other write path
would leave it stale unless it set it itself.

**The tracker never writes this table**; it stores a `contact_id` on its threads and nothing more.
The Resume Formatter's `getSharedClient` is exported and never called (TEC-26).

**The only create path is in the paused editor.** `tp-message-editor` deploys `BLOCKED`, so what
creates contacts in production is its last good build, not necessarily this code.

**Adding a write path anywhere else changes this contract.** It goes to Joel through the technical
director as a new cross-app contract, and this section changes in the same pull request.

## `tracker.pipeline_threads` — the write contract

Owned by the Pipeline Tracker (`apps/tracker`, TechPad Gen's) and written by the Resume Formatter
(`apps/resume`) as well, which makes it a cross-app contract like the one above rather than either
agent's note — the second table written across a tool boundary, after `shared.contacts`. **The
tracker was parked by Joel on 2026-09-24.**
Read from the code on 2026-09-24.

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

**Resume's write-through is not atomic.** It writes the thread first and links the render second,
so a failed link followed by a retry creates a second thread for the same application. The notes
merge is read-then-write: a notes edit in the tracker between the two is lost.

**`stage` has a check constraint and no default**, so every writer sets it. **`updated_at` has no
trigger**: it moves on the two PATCH paths only and nothing reads it.

**The tracker also reads other apps' schemas, read-only**: `editor.message_history`,
`resume.renders` and `resume.templates`, for the dashboard (`lib/dashboard.ts`). No constraint ties
the reader to those columns, so changing one of them is a change to this contract too.

**Adding a write path anywhere else changes this contract.** It goes to Joel through the technical
director, and this section changes in the same pull request — exactly as for `shared.contacts`.

## Why the grants look alarming

`20260910051549` sets this for each of its schemas, and every later schema's grants migration
repeats it:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA <each> GRANT ALL ON TABLES TO anon, authenticated, service_role;
```

So every table created in these schemas is automatically granted to `anon` — including DELETE and
TRUNCATE — whether or not its migration says anything about grants. The tables `20260906152749`
created are the exception: they hold SELECT, INSERT, UPDATE and DELETE only, which is what
production has and what `record_original_table_grants` records.

That is intended, but it means **Row Level Security is the only control between a leaked
publishable key and this data.** RLS is enabled on every table with zero policies, which is
deny-by-default and is why Supabase's advisor reports one `rls_enabled_no_policy` notice per table:
those are the design working, not a warning to fix.

The practical rule: adding a table here grants `anon` full access to it by default. Enable RLS in
the same migration. Never assume a new table is protected by anything else.
