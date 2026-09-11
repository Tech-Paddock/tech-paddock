# Coffee — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## Built and merged, not deployed

`apps/coffee` landed on `main` as **#23**. It is complete, tested and it builds. It has never run
anywhere.

Verified today, directly, not inferred:

- **16/16 tests pass** — `guide.test.ts` (9), `methods.test.ts` (5), `bags.test.ts` (2)
- **`npm run build` succeeds clean** — 6 routes, 5 API routes, middleware at 27kB, no type errors
- **`coffee.bags` exists in Postgres with RLS enabled**, zero rows
- **The build needs no environment variables.** They are read per request, not at build time. So
  Vercel will build this successfully before it is configured, and then throw at runtime on a
  missing `SESSION_SECRET`. **A green build will not tell you the config is right.**

## What stands between it and live

All of it is Vercel configuration, and none of it is yours. `tp-coffee-app` still points at the
**repo root** rather than at `apps/coffee`, which is why `tech-paddock.vercel.app` currently serves
an empty page outside the password gate — the gate lives in each app's middleware, so a project
with no app has no gate.

Needed on that project: Root Directory → `apps/coffee`, framework → Next.js, five environment
variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`,
`ANTHROPIC_API_KEY`), then attach `coffee.techpaddock.io`.

Two things follow for you:

1. **You cannot verify the search step yet.** It is the one part of this tool that no test covers
   and no sandbox can exercise, because roaster domains are blocked by the egress proxy. It needs
   a deploy preview and a real bag. Until that has happened, treat the three-tier search as
   **unproven**, not working.
2. **Deployments are broken repo-wide right now.** Vercel's GitHub App lost its installation when
   the repo was transferred, so no push has triggered a build since 17:48 today. Even once
   `tp-coffee-app` is configured, nothing ships until that is reconnected.

## A branch you should not touch

`claude/coffee-brewing-assistant-hmvffw` and its **PR #28** are the original version of this work,
superseded by #23. It is 7 ahead and 14 behind `main`, and GitHub already reports it as
conflicting.

Do not merge it, do not rebase it, do not mine it for ideas without checking against `main` first.
It carries three things that were deliberately fixed on the way in:

- a proposal to rename the Vercel projects to bare names, which **was declined** — the `tp-` prefix
  stays
- its migration at `apps/coffee/supabase/migrations/0001_coffee_schema.sql`, the wrong place; one
  project means one history at the repo root, and `main` carries it correctly as
  `20260911203000_coffee_schema.sql`
- no grants migration at all. `main` has `20260911203100_grant_coffee_schema_usage.sql`, without
  which the `coffee` schema is unreadable **even by `service_role`** and every query fails on
  permissions with nothing in the app's own code to explain why

The recommendation on the ledger is to close #28 and delete the branch.

## Next steps

1. Wait for `tp-coffee-app` to be configured. Nothing you can do moves that.
2. Once there is a preview URL: run a real bag through the whole flow. Photograph, confirm, search,
   save. That is the first genuine test of `validateGuide` against a live roaster site and the
   first chance to see which tier actually answers in practice.
3. Expect `normalizeMethod` to need alias tuning after that run. The vocabulary is right; the
   regexes were written against how roasters *tend* to word things, not against a real sample.
4. Nothing else is queued. The deliberately-unbuilt list — brew log, timer, inventory, method
   lookup table — stays unbuilt until asked for.
