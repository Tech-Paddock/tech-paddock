---
name: new-app
description: Stand up a new tool under apps/ — the design first, then the scaffold, then the short list of steps only Joel can do. Runs maybe twice a year.
---

# New app

The steps that can hurt are outside the repo — a Vercel project, a DNS record, a dashboard
setting — and none has an undo. **Solution first, scaffold second, hand Joel only what he alone can
do.**

## Settle first

1. **What it is — Joel's**, worked out before any folder exists: what it is for, what it stores,
   what it must never do. It lands as a draft `apps/<name>/RULES.md`, which Joel approves.
2. **The name — Joel's.** It fixes the folder, the subdomain and the Vercel project at once.
3. **Its own Postgres schema? — Joel's.** If yes: two migrations and one dashboard setting; read
   `supabase/README.md` first. A new schema inherits no grants.
4. **Site or app — the TD's**, by `.claude/SURFACE.md`; Joel can overrule.

## In the repo — one branch

- **The app folder**, copied from the nearest existing app. **Stamp the shared files**
  (`node scripts/stamp-shared.mjs`); a hand copy fails `drift`. The gate file its Next major runs
  takes the **base** copy — a fourth variant fails `drift` on purpose.
- **`RULES.md`** (approved) and an empty **`NOTES.md`**.
- **`.env.example`** — names and how to generate them, never a value.
- **`/api/health`**, which The Garage probes.
- **A row in `CLAUDE.md`'s domain map** — a `CLAUDE.md` edit, so Joel approves it.
- The CI matrix and branch protection need nothing; adding `TOOLS` in
  `apps/home/lib/platform.ts` is a separate home change.

## Outside the repo — Joel's, in this order

Hand him one message; each line says what breaks if it is skipped.

1. **The Vercel project**, Root Directory `apps/<name>`.
2. **Its environment variables.** `SESSION_SECRET` byte-identical to the others, or the shared
   cookie silently stops working on every app.
3. **The DNS record**, a CNAME like the rest.
4. **The Supabase exposed-schemas list**, if it has a schema — the step that gets missed.
5. **Build it again with `FORCE_BUILD`**, then remove it: variables bake in at build time and the
   ignore step cancels a bare redeploy.

## Verify

`drift` 0 fail; the app's probe in The Garage once `TOOLS` has it; the subdomain in a private
window asks for the password.
