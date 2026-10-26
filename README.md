# Paddock

A personal command center at `techpaddock.io`: one shared foundation and a set of standalone tools,
each deployed on its own. [CLAUDE.md](./CLAUDE.md) holds the architecture and working rules.

## Layout

One repo and one Supabase project. Each tool is its own app with its own `package.json` and its own
Vercel project (Root Directory set to its folder).

```
apps/<app>/  → one tool  → its subdomain
```

The subdomain table in [CLAUDE.md](./CLAUDE.md) maps each one. The hub, `apps/home` at
`techpaddock.io`, frames each tool and shows what is live. It holds no database credential; its
only tokens are for Linear (the Pit Wall) and GitHub deployment state (The Garage).

There is no root `package.json`; work inside an app (`cd apps/<app> && npm install`). Each app's
`.env.example` lists its variables and how to generate them.

[`packages/shared`](./packages/shared/README.md) holds the one copy of every file that must match
across apps. Edit it there and run `node scripts/stamp-shared.mjs` (`--check` verifies). Never edit
a stamped copy.

## Database

One Postgres schema per tool; never `public`. Migrations live in
[`supabase/`](./supabase/README.md). Read that README before writing one.

## Live state

Not written here; it goes stale. The Garage, the hub's Garage tab
([`techpaddock.io/?tab=garage`](https://techpaddock.io/?tab=garage)), probes each project live and
shows `drift` as of the hub's last build.
