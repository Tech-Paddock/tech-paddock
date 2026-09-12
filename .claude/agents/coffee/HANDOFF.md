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

## It is live

**Deployed and reachable as of 2026-09-12, 02:00.** `coffee.techpaddock.io` returns 200 and serves
your login page. Root Directory is `apps/coffee`, the domain is attached, DNS resolves through the
shared CNAME target, and the build log shows dependencies installed and `next build` run — against
the 153ms `no files were prepared` it produced while still pointed at the repo root.

`tech-paddock.vercel.app` also points at this project and now serves the same gated login, so the
ungated page this file used to warn about is gone.

**One check is still unrun and it is the one that matters: `GET /api/health`, behind the login.**
The five environment variables are invisible to every API, are read per request rather than at build
time, and a green build proves nothing about them. The route names whichever of the `coffee` schema,
the `coffee-files` bucket, or `ANTHROPIC_API_KEY` is unhappy. Run it before trusting a bag scan.

The framework preset still reads `Other`, and that is cosmetic: your `vercel.json` declares `nextjs`
and overrides the dashboard, which is why the build succeeded with the preset unset.

**As of 23:31 the project is partly configured.** Its `updatedAt` moved, so something was changed,
but the framework preset is still `null` and the domain is still not attached. Root Directory and
the environment variables are not exposed by the Vercel API, so no session can confirm them — which
is what the health check below is for.

**You have `GET /api/health`** (#31). Once you can log in, it names which dependency is unhappy: the
`coffee` schema, the `coffee-files` bucket, or a missing `ANTHROPIC_API_KEY`. Reaching it at all
proves `APP_PASSWORD_HASH` and `SESSION_SECRET` are right, because it sits behind the gate. The
Anthropic check is presence and shape only and reports "set", never "working" — a live call would
cost money and could fail for unrelated reasons.

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

1. Wait for `tp-coffee-app` to be configured. Nothing you can do moves that. When it is, hit
   `/api/health` before anything else — a green build says nothing about whether the five
   environment variables are right, because they are read per request rather than at build time.
2. Once there is a preview URL: run a real bag through the whole flow. Photograph, confirm, search,
   save. That is the first genuine test of `validateGuide` against a live roaster site and the
   first chance to see which tier actually answers in practice.
3. Expect `normalizeMethod` to need alias tuning after that run. The vocabulary is right; the
   regexes were written against how roasters *tend* to word things, not against a real sample.
4. Nothing else is queued. The deliberately-unbuilt list — brew log, timer, inventory, method
   lookup table — stays unbuilt until asked for.
