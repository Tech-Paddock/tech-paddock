# Paddock

A personal command center — one shared foundation supporting a few standalone tools, each
independently deployed off `techpaddock.io`. See [CLAUDE.md](./CLAUDE.md) for the full
architecture, shared Supabase project, and per-tool specs.

## Layout

This is a monorepo: one repo, one shared Supabase project, but each tool is its own app with
its own `package.json`, deployed as its own independent Vercel project (pointed at its
subfolder via that project's Root Directory setting).

```
apps/
  editor/    → Message Editor      → editor.techpaddock.io    (live)
  tracker/   → Pipeline Tracker    → tracker.techpaddock.io   (not started)
  resume/    → Resume Formatter    → resume.techpaddock.io    (not started)
```

Each app's own README covers its local setup and environment variables. There's no root
`package.json` — work inside the relevant `apps/*` folder (`cd apps/editor && npm install`, etc).
A `packages/shared` folder will hold code reused across tools if and when there's actually
something worth sharing — nothing lives there yet.
