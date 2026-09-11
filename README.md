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
  home/      → Command center hub → techpaddock.io            (live)
  editor/    → Message Editor      → editor.techpaddock.io    (live)
  tracker/   → Pipeline Tracker    → tracker.techpaddock.io   (live)
  resume/    → Resume Formatter    → resume.techpaddock.io    (live)
```

Each app's own README covers its local setup and environment variables. There's no root
`package.json` — work inside the relevant `apps/*` folder (`cd apps/editor && npm install`, etc).
`packages/shared` was never created. `lib/auth.ts` and `lib/password.ts` ended up as
byte-identical copies in all four apps, which means a session or lockout fix is the same edit four
times. Worth consolidating before the auth logic changes again; see CLAUDE.md.

One app has tests: `apps/resume` (`npm test`). CI runs `npm run test --if-present` for every app
before building it, so adding a `test` script to another app is enough to opt it in.
