# Paddock

A personal command center — one shared foundation supporting a few standalone tools, each
independently deployed off `techpaddock.io`. See [CLAUDE.md](./CLAUDE.md) for the full
architecture, shared Supabase project, per-tool specs, and the rules every agent works under.

## Layout

This is a monorepo: one repo, one shared Supabase project, but each tool is its own app with
its own `package.json`, deployed as its own independent Vercel project (pointed at its
subfolder via that project's Root Directory setting).

```
apps/
  home/      → Command center hub → techpaddock.io            (live)
  editor/    → Message Editor      → editor.techpaddock.io    (live)
  tracker/   → Pipeline Tracker    → tracker.techpaddock.io   (live)
  resume/    → Resume Formatter    → resume.techpaddock.io    (live)
  coffee/    → Coffee              → coffee.techpaddock.io    (built, not yet deployed)
```

The hub opens on what is live rather than on a list of links. It holds no database credentials:
each tool exposes `/api/summary` and the hub fans out server-side, so adding a tool to the glance
is a URL in `SOURCES` rather than new knowledge in the hub.

Each app's own README covers its local setup and environment variables. There's no root
`package.json` — work inside the relevant `apps/*` folder (`cd apps/editor && npm install`, etc).
`packages/shared` was never created. `lib/auth.ts` and `lib/password.ts` ended up as
byte-identical copies in all five apps, which means a session or lockout fix is the same edit five
times. Worth consolidating before the auth logic changes again; see CLAUDE.md.

## Tests

Three apps have them — `resume` (60), `tracker` (38), `coffee` (16). CI runs
`npm run test --if-present` for every app before building it, so adding a `test` script to
`editor` or `home` is enough to opt them in.

The CI matrix in `.github/workflows/ci.yml` is **hardcoded** to the five app names. A sixth app
is silently untested until it is added there — it does not fail, it simply never runs.

## Database

One Supabase project, one schema per tool plus `shared`, never the default `public` schema. The
migration history lives at [`supabase/`](./supabase/README.md) at the repo root rather than under
any one app — one project means one history.

Read that README before writing a migration. Two things in it are load-bearing and neither is
obvious: a new schema inherits no grants at all, and RLS is the only control standing between a
leaked publishable key and the data.

## Working here as an agent

Read the Rules of Engagement in [CLAUDE.md](./CLAUDE.md) — they are loaded into every session
automatically — then run:

```bash
bash .claude/worklogs/read-all.sh
```

That prints the technical director's open-items ledger and every agent's worklog across all
branches, plus any branch carrying commits without one. Agents here never run at the same time, so
the repo is the only channel between them.
