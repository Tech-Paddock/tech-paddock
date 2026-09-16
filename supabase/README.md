# Supabase

One Supabase project (`qyclakzsupyxgnqfgpiq`, `tech-paddock`) backs every app in this repo, with
each tool in its own Postgres schema — `shared`, `editor`, `tracker`, `resume`, `coffee` — and
never the default `public` schema.

The migration history lives here, at the repo root, rather than under any one app. One project
means one history; splitting it per app is exactly how it drifted in the first place.

## History

Six of the first seven migrations were applied directly to the project and only checked in
afterwards, on 2026-09-11. Their contents are copied verbatim out of
`supabase_migrations.schema_migrations`, so the files match what actually ran, not what someone
remembers running. File timestamps are therefore much later than the migration versions — that is
expected. Everything from `20260911202805` onward was written first and applied second, which is
the order this directory exists to enforce.

| Version | What it does |
|---|---|
| `20260906152749` | Schemas, `shared.contacts`, editor and tracker tables, the original resume content tables |
| `20260908235234` | **Absent by design — see below** |
| `20260909004741` | `purpose` and `tone` on `editor.message_history` |
| `20260910051549` | Schema USAGE and default privileges for the API roles |
| `20260910215015` | `editor.model_status`, the model drift check's singleton row |
| `20260911034533` | Resume Formatter rebuild; drops the four original content tables |
| `20260911144519` | `position` on `shared.contacts` |
| `20260911202805` | The `coffee` schema and `coffee.bags`, plus the private `coffee-files` bucket |
| `20260911202901` | Grants for the `coffee` schema — see below, this one is not optional |
| `20260912034941` | Backgrounding the brew-guide search: in-flight, failure and provenance columns |
| `20260912213501` | Splits a bag from its brews; `coffee.brews` with a generated `extraction_yield` |

### Four versions were renamed on 2026-09-14, and why that is the honest direction

The four `coffee` migrations were applied through the hosted API rather than the CLI, and **that
path stamps its own version at the moment it runs and ignores the filename.** So the repo said
`20260911203000_coffee_schema` while the database recorded `20260911202805`, and similarly for the
other three. Nobody noticed, because nothing compares the two until you run `migration list`.

The files were renamed to the versions that actually ran. **The alternative — editing the database's
recorded versions to match the filenames — was rejected, and the reason is worth keeping.** This
directory exists so the database stops being the only record of its own shape; it does not follow
that the repo overrules the database about *what already happened*. The database is the record of
what ran and when. The repo is the record of what was intended. When they disagree about history,
history wins, and the cheap side moves.

It also means `supabase migration repair` was never needed, which matters because the brief forbids
it. A rule that would have had to be argued around turned out not to apply.

The SQL was verified identical before renaming — statement by statement against
`supabase_migrations.schema_migrations`, not eyeballed. The only difference is that the hosted API
strips the leading comment block, so the *reasoning* for each migration lives in this directory and
nowhere else. That is an argument for the files, not against them.

**What to expect from this in future:** any migration applied through the hosted API will do this
again. Name the file after the fact where you can, or rename it to match once applied, and check
`migration list` afterwards rather than assuming.

### The deliberate gap

`20260908235234_seed_contacts_threads_style_guide` is **not in this directory and should not be
added.** It is data, not schema, and the data is seven real contacts — named people and named
companies. The repo's no-personal-information rule applies to migrations exactly as it applies to
docx fixtures.

Consequences to expect:

- `supabase migration list` will always show `20260908235234` as present remotely and missing
  locally. That is correct and permanent. **It should be the only difference** — as of 2026-09-14 it
  is again, and a second discrepancy appearing means something drifted and is worth reading rather
  than dismissing.
- **Do not run `supabase migration repair` on it.** Repairing would edit the remote history to
  match the repo, falsifying the record of what was actually applied in order to silence a gap we
  chose on purpose.
- A rebuild from these files produces the correct schema with an empty `shared.contacts`. Seed data
  is re-entered through the apps.

## Working with it

There is no root `package.json` in this repo by design, so the CLI runs through `npx`:

```bash
npx supabase@latest link --project-ref qyclakzsupyxgnqfgpiq   # one time, needs an access token
npx supabase@latest migration list                            # local vs remote
npx supabase@latest db pull -f <name>                         # capture remote drift as a new file
```

The remote project ref is not stored in `config.toml`; `link` writes it to `supabase/.temp/`, which
is gitignored.

**Any schema change from here on gets a file in this directory and goes through a pull request.**
If you change the database first, `db pull` it back immediately — the whole point of this directory
is that the database stops being the only record of its own shape.

`config.toml` is the generated default with one edit: `[api] schemas` lists the custom schemas
alongside `public`, so a local stack exposes them. **Add a new schema there too** — it is easy to
miss, and a local stack will simply not see the tables. Without it, `supabase start` would serve an API
that cannot see any of this project's tables.

## How a migration actually gets applied

This section exists because it did not, and that silence is the most plausible root cause of the
version drift above. The Resume Formatter found the gap on 2026-09-14 while trying to apply its own
migration: this file documented `link`, `migration list` and `db pull` — how to inspect the history
and how to capture drift — and never once said how anything gets *applied*. An agent that needs to
apply a migration and finds no documented path invents one.

**`supabase db push` does not work here, and it is not going to.** It refuses when the remote
history contains a version the local directory does not have — *"Remote migration versions not found
in local migrations directory"* — and it writes nothing. `20260908235234` is remote-only
**permanently and on purpose**, because it is seven real contacts and this repo does not commit
names. So the one condition `db push` requires is the one condition this project has deliberately
chosen never to satisfy. That is not a bug to work around; it is the cost of the decision, and it
was simply never written down.

**So: the technical director applies migrations through the hosted API, at gate time, before
merging.** Not by hand in the SQL editor, not by an app agent, and not by Joel. That is now a rule
in `CLAUDE.md` rather than a habit, alongside the shape rule that makes applying-before-merging safe
in the first place.

**The one thing to get right is the recorded version.** The hosted API stamps its own version from
the clock at the moment it runs and ignores the filename — that is exactly how four `coffee`
migrations came to disagree with the repo. Two ways to keep them in step:

1. **Record the file's own version as part of applying it.** The version column is a sequence key,
   not an audit timestamp, so writing the version the repo already declares is accurate and the
   filename never has to change. **Preferred**, and to be proven on the next migration applied —
   which is the resume one — rather than asserted here.
2. **Rename the file to whatever got recorded.** What was done for the four `coffee` migrations,
   retroactively. It works, but it means editing a branch after its author is finished with it.

Either way, **read the history back afterwards** and confirm local and remote differ by exactly one
version. Not doing that is the whole of how this went unnoticed for three days.

## A new schema does not inherit anything

`20260910051549` granted schema USAGE by naming four schemas explicitly. It cannot cover a schema
that did not exist when it ran, so **every new schema arrives with no USAGE for the API roles** and
every query against it fails on permissions — not on anything visible in the application code.

This already bit once: `coffee` was created with a correct, RLS-enabled migration and was still
unreachable until `20260911202901` granted it. Note also that `ALTER DEFAULT PRIVILEGES` only
affects tables created *after* it runs, so a schema's existing tables need `GRANT ALL ON ALL TABLES`
as well.

**Adding a schema means two migrations and one dashboard setting — three steps, not two.**

1. The schema and its tables.
2. Its grants. Copy `20260911202901_grant_coffee_schema_usage.sql` and change the schema name.
3. **Add it to the hosted project's exposed schemas, in the Supabase dashboard**: Project Settings →
   API → Exposed schemas. PostgREST only answers for schemas on that list, and it is not in this
   repo. Adding the schema to `[api] schemas` in `config.toml` is *also* worth doing, but it
   configures the **local** stack only and does nothing to the hosted project.

Step 3 is the one that is easy to miss, and it fails in a way that looks like a credentials problem.
**This bit on 2026-09-12.** `coffee` had a correct migration, correct grants — verified directly:
`service_role` had USAGE on the schema and SELECT on `coffee.bags` — and `coffee` was already listed
in `config.toml`. The app still answered:

```
{"name":"database","ok":false,"detail":"Invalid schema: coffee"}
```

for about an hour, while the key was suspected instead. Adding `coffee` in the dashboard fixed it
with no code change, no migration and no redeploy: PostgREST restarted and logged
`Schema cache loaded 8 Relations` — 8 rather than 7, which is `coffee.bags` arriving.

**How to check it from a session without dashboard access:** `postgrest_logs` reports the relation
count on every reload. Count the tables across the schemas you expect to be exposed; if the log's
number is short, one of them is not on the list.



## Why the grants look alarming

`20260910051549` sets:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA <each> GRANT ALL ON TABLES TO anon, authenticated, service_role;
```

So every table created in these schemas is automatically granted to `anon` — including DELETE and
TRUNCATE — whether or not the migration that creates it says anything about grants.

That is intended, but it means **Row Level Security is the only control between a leaked
publishable key and this data.** RLS is enabled on every table with zero policies, which is
deny-by-default and is why Supabase's advisor reports one `rls_enabled_no_policy` notice per table:
those are the design working, not a warning to fix.

The practical rule: adding a table here grants `anon` full access to it by default. Enable RLS in
the same migration. Never assume a new table is protected by anything else.
