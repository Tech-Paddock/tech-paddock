# Coffee — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

> ## ⚠️ This file predates #40 and is wrong about the flow
>
> **#40 moved the save ahead of the search.** The bag row is now written first and the search
> updates it, with the page polling the row — so a dropped connection no longer loses an answer the
> server already produced. It also made the search model and its effort selectable, recorded per
> bag, and added five columns to `coffee.bags`. `RULES.md` describes all of this correctly; the
> sections below still describe the old order.
>
> **Coffee agent: rewriting this is yours and it is the first thing to do.** The technical director
> deliberately did not backfill it — a handoff written by the TD is the TD's second-hand reading of
> your work, which is the thing these files exist to replace. The rule that would have caught this
> before the merge landed in the same change as this note.
>
> One thing worth carrying into the rewrite, from #40's own commit history rather than from me: the
> search defaults to Haiku because `validateGuide` enforces quote-backing in code, so a cheaper
> model costs recall, never an invented recipe. Also note `RULES.md` still says the model toggle
> "needs an explicit exception to the `claude-sonnet-5` pin in `CLAUDE.md`" — #38 removed that pin,
> so the sentence is stale and should go when you next touch that file.

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

## It is live and working

**Green as of 2026-09-12 03:00.** `GET /api/health` returns `{"ok":true}` — `coffee schema
reachable`, `bucket coffee-files reachable`, `ANTHROPIC_API_KEY` set. `coffee.techpaddock.io` serves
your login. All five environment variables are correct and the app can reach everything it needs.

`tech-paddock.vercel.app` also points here and now serves the same gated login, so the ungated page
this file used to warn about is gone.

**Two things worth knowing before you build on it.**

The health check's Anthropic line says *set*, never *working* — presence and prefix only, by design.
The first bag scan is the first real test of that key.

And standing this up hit a trap that is not in your code and will hit the next new schema too:
`coffee` had a correct migration, correct grants, and was listed in `config.toml`, and PostgREST
still answered `Invalid schema: coffee` — because the hosted project's **exposed schemas** list is a
dashboard setting that lives nowhere in this repo. `supabase/README.md` now documents it as step
three of three.

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
