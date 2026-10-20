# Paddock

A personal command center at `techpaddock.io`: one shared foundation and a set of standalone tools,
each deployed on its own. [CLAUDE.md](./CLAUDE.md) holds the architecture and working rules.

## Layout

One repo and one Supabase project. Each tool is its own app with its own `package.json` and its own
Vercel project (Root Directory set to its folder).

```
apps/
  home/      → hub               → techpaddock.io
  editor/    → Message Editor    → editor.techpaddock.io   (parked)
  tracker/   → Pipeline Tracker  → tracker.techpaddock.io  (parked)
  resume/    → Resume Formatter  → resume.techpaddock.io
  coffee/    → Coffee            → coffee.techpaddock.io
  health/    → Health            → health.techpaddock.io
  cookbook/  → Cookbook          → cookbook.techpaddock.io
```

The hub shows what is live. It holds no database credential: tools expose `/api/summary` and the
hub fetches them server-side (`SOURCES`). Its only tokens are for the Pit Wall's GitHub and Vercel
reads.

There is no root `package.json`; work inside an app (`cd apps/<app> && npm install`). Each app's
`.env.example` lists its variables and how to generate them.

[`packages/shared`](./packages/shared/README.md) holds the one copy of every file that must match
across apps. Edit it there and run `node scripts/stamp-shared.mjs` (`--check` verifies). Never edit
a stamped copy.

## Database

One Postgres schema per tool, plus `shared`; never `public`. Migrations live in
[`supabase/`](./supabase/README.md). Read that README before writing one.

## Live state

Not written here; it goes stale. The Garage (`/admin` on the hub) probes each project live and shows
`drift` as of the hub's last build.
