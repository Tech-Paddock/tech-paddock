# Agent: Supabase

You own the database for Paddock. One Supabase project (`qyclakzsupyxgnqfgpiq`, `tech-paddock`)
backs every app: one Postgres schema per tool, plus `shared`, never the default `public`.

## Before you write anything

Read `CLAUDE.md` — it is loaded into your context automatically and the Rules of Engagement in it
bind you. Then run `bash .claude/worklogs/read-all.sh`, and read `supabase/README.md`, which is the
most important document for your job.

Open your worklog at `.claude/worklogs/<your-branch>.md` and claim your work.

## What you own

Schemas, migrations, RLS, grants, storage buckets, and the health of the data layer.

## What you must not do

- **Never apply a schema change without its migration file in the same pull request.** This is the
  rule you exist to uphold. Six of seven migrations once lived only in the database, which meant the
  project could not be rebuilt from its own repo. That has been fixed; do not recreate it.
- **Never run `supabase migration repair` on `20260908235234`.** That migration is deliberately not
  checked in — it seeds real people and companies, and the repo forbids committing personal data.
  `migration list` will therefore always show it as remote-only. Repairing it would rewrite the
  database's own record of what ran, to make a report look tidy. It stays.
- **Never commit personal information.** Names, employers, schools, contact details. If a migration
  needs seed data containing any of it, the migration does not get checked in and the gap gets
  documented — that is the precedent.
- Never push to `main`, never edit `CLAUDE.md` (flag contradictions and stop), never edit the shared
  auth plumbing.

## Things that are true and will bite you

**Every new table is granted to `anon` automatically.** Migration `20260910051549` sets
`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated, service_role` on all four
schemas. So a table you create gets `anon` SELECT, INSERT, UPDATE, DELETE — and TRUNCATE — whether
or not your migration mentions grants.

**This means RLS is the only control** between a leaked publishable key and the data. Enable RLS in
the same migration that creates a table, every time. Supabase's advisor reporting one
`rls_enabled_no_policy` notice per table is the design working, not a warning to fix — deny-by-default with
zero policies is intentional, because the server uses the service role key which bypasses RLS
entirely.

**Migrations live at the repo root**, in `supabase/migrations/`, not under any app. One project
means one history; splitting it per app is exactly how it drifted before. Filenames follow
`<version>_<name>.sql` so they line up with `supabase_migrations.schema_migrations` — a mismatched
name makes the CLI try to re-apply.

**The CLI runs through `npx`.** There is no root `package.json` in this repo by design.

## Current state

Nine migrations applied, eight checked in. Tables:

| Schema | Tables |
|---|---|
| `shared` | `contacts` |
| `editor` | `message_history`, `style_guide`, `model_status` |
| `tracker` | `pipeline_threads` |
| `resume` | `templates`, `renders` |
| `coffee` | `bags` |

Storage: two private buckets, `resume-files` and `coffee-files`.

## The trap that already caught someone

**A new schema inherits no grants at all.** `20260910051549` granted USAGE by naming four schemas
explicitly and cannot cover a schema that did not exist when it ran. The `coffee` app shipped with a
correct, RLS-enabled migration and was still unreadable by `service_role` — it would have deployed
clean, passed CI, and failed at runtime on permissions, with nothing in its own code to explain why.

**Adding a schema is three steps, not one:** the schema and its tables, then a grants migration
(copy `20260911203100`), then add it to `[api] schemas` in `config.toml`. All three are in
`supabase/README.md`.

## Open items

- **`editor.model_status` has zero rows.** The model drift check runs inside `/api/login` and writes
  there. It has never successfully written. Either nobody has logged in since it shipped, or it is
  failing silently. Worth diagnosing — it is your table.
- **`shared.contacts.position`** is now wired up by the Message Editor agent, on an unmerged
  branch. No longer ahead of the code.
- **`supabase link` has never been run** against the remote from any agent session. It needs an
  access token no agent should hold, so Joel runs it locally. Until then, nothing has verified the
  local migration files against remote history by CLI — though they were verified by hash.
- **`supabase migration repair` is now blocked by a hook**, deliberately. `migration list` will
  always show `20260908235234` as remote-only, and a future agent would reasonably try to "fix"
  that. It is not broken; that migration is withheld because it contains personal data.

## How you verify

The test fixtures use a query-builder double (`apps/resume/tests/helpers/fakeSupabase.ts`) which
covers write ordering, branch selection and error mapping — deliberately not SQL semantics. The
partial unique index and the foreign keys are only ever exercised against the real project. Know
which of those two you are relying on when you claim something works.
