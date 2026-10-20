---
name: new-app
description: Stand up a new tool under apps/ — the design first, then the scaffold, then the short list of steps only the owner can do. Runs maybe twice a year.
---

# New app

The risky steps are outside the repo (Vercel project, DNS record, dashboard setting) and have no
undo. Design first, scaffold second, then hand the owner only what the owner alone can do.

## Settle first

1. **What it is (owner):** purpose, what it stores, what it must never do. Lands as a draft
   `apps/<name>/RULES.md` for approval.
2. **The name (owner):** fixes folder, subdomain and Vercel project.
3. **Own Postgres schema? (owner):** if yes, two migrations and a dashboard setting; read
   `supabase/README.md` first. A new schema inherits no grants.
4. **Site or app (TD);** the owner can overrule. Ask in order; the first answer wins:
   1. How often, and from where? Many times a day, phone in hand, mid-task: app. A few times a
      week, sitting down: site.
   2. Do you arrive knowing what to do? One decided thing: app. Looking at what is there: site.
   3. Would it go on the home screen? If not, it is not an app.

   Count how often it is opened and in what state of mind, never its routes. A tool that fits
   neither is designed with the owner; one that seems to be both may be two tools. Copy the
   matching Surface section from an existing app's `RULES.md` into the draft.

## In the repo: one branch

- **The app folder,** copied from the nearest app. Stamp shared files with
  `node scripts/stamp-shared.mjs`; a hand copy fails `drift`. Use the **base** gate file for its
  Next major; a fourth variant fails `drift`.
- **`RULES.md`** (approved) and an empty **`NOTES.md`**.
- **`.env.example`:** names and how to generate them, never values.
- **`/api/health`,** probed by The Garage.
- **A row in `CLAUDE.md`'s domain map** (needs owner approval).
- CI and branch protection need nothing. Adding to `TOOLS` in `apps/home/lib/platform.ts` is a
  separate home change.

## Outside the repo: the owner's, in order

Send one message; each line says what breaks if skipped.

1. **Vercel project,** Root Directory `apps/<name>`.
2. **Environment variables.** `SESSION_SECRET` byte-identical to the others, or the shared cookie
   silently fails on every app.
3. **DNS record:** a CNAME like the rest.
4. **Supabase exposed-schemas list,** if it has a schema. This is the step that gets missed.
5. **Rebuild with `FORCE_BUILD`,** then remove it: vars bake in at build time and the ignore step
   cancels a bare redeploy.

## Verify

`drift` 0 fail; the app's probe in The Garage once `TOOLS` has it; the subdomain asks for the
password in a private window.
