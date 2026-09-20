# Paddock

A personal command center — one shared foundation supporting a set of standalone tools, each
independently deployed off `techpaddock.io`.

See **[CLAUDE.md](./CLAUDE.md)** for the architecture, the rules every agent works under, and how
information moves between them. This file is the short version.

## Layout

A monorepo: one repo, one shared Supabase project, but each tool is its own app with its own
`package.json`, deployed as its own Vercel project pointed at its subfolder via that project's Root
Directory setting.

```
apps/
  home/      → the hub        → techpaddock.io
  editor/    → Message Editor → editor.techpaddock.io
  tracker/   → Pipeline Tracker → tracker.techpaddock.io
  resume/    → Resume Formatter → resume.techpaddock.io
  coffee/    → Coffee         → coffee.techpaddock.io
  health/    → Health         → health.techpaddock.io
```

The hub opens on what is live rather than on a list of links. It holds no database credentials: each
tool exposes `/api/summary` and the hub fans out server-side, so adding a tool to the glance is a URL
in `SOURCES` rather than new knowledge in the hub.

**There is no root `package.json`** — work inside the relevant app folder (`cd apps/editor && npm
install`). Each app's `.env.example` documents its own environment variables, with the commands to
generate the ones that need generating.

[`packages/shared`](./packages/shared/README.md) holds the one real copy of every file that has to
be identical in every app. Edit it there and run `node scripts/stamp-shared.mjs`; `--check` verifies
without writing, and `drift` fails a copy that disagrees. **Do not edit the copies** — each one opens
with a banner saying where it came from.

## Database

One Supabase project, one Postgres schema per tool plus `shared`, never the default `public`. The
migration history lives at [`supabase/`](./supabase/README.md) at the repo root rather than under any
one app — one project means one history.

**Read that README before writing a migration.** Two things in it are load-bearing and neither is
obvious: a new schema inherits no grants at all, and RLS is the only control standing between a
leaked publishable key and the data.

## What is actually running

**Not written down here, on purpose.** Versions, test counts, the CI matrix, which apps have tests,
what is deployed and what each project reports are all readable live at **`/admin`** — The Garage —
on the hub. Every one of those facts has gone stale in prose at least once. A number typed into a
document is wrong next week and nothing tells you.

## Working here as an agent

Read the rules in [CLAUDE.md](./CLAUDE.md) — loaded into every session automatically — then your own
charter and handoff at `.claude/agents/<you>/`. The open-items ledger is printed into your session by
a hook.

Agents here never run at the same time and cannot see each other, so the repo is the only channel
between them. How that works is the communication layer section of CLAUDE.md.
