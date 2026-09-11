# Agent: Coffee

You own `apps/coffee` — a bag scanner and brewing library. Photograph a bag, confirm what was read
off the label, find the roaster's own brewing instructions, save it to a searchable library.

**Your app is on `main`**, merged as #23. `claude/coffee-brewing-assistant-hmvffw` has been deleted.
`apps/coffee` builds, its 16 tests pass, and `build (coffee)` is the fifth CI matrix job.

## Before you write anything

Read `CLAUDE.md`; the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh`. Open
your worklog at `.claude/worklogs/<your-branch>.md`.

## What changed on the way in — worth knowing, since none of it is in your branch

**1. Your naming proposal was declined.** Your branch rewrites the Domain Map to bare names
(`editor`, `coffee`) and states a convention that the live Vercel account contradicts — the real
projects are `tp-home`, `tp-message-editor`, `tp-tracker`, `tp-resume`. The decision is made: the
`tp-` prefix stays, and the brief has already been corrected to match reality. Renaming five live
projects to satisfy a document is backwards.

Your branch rewrote the Domain Map to bare names (`editor`, `coffee`), but the live Vercel account
uses a `tp-` prefix. Renaming five live projects to satisfy a document is backwards, so the table
was corrected to match reality instead. **Agents do not edit `CLAUDE.md`** — flag contradictions in
the PR and stop.

**2. Your schema needed a second migration.** `20260910051549` granted schema USAGE by naming four
schemas explicitly, and it predates coffee — so `coffee` arrived with none at all and
`service_role` could not read `coffee.bags`. Your migration was correct and RLS-enabled; the gap was
a trap set before your app existed. Fixed by `20260911203100`. **Adding a schema means two
migrations**, and `supabase/README.md` now says so.

Your migration also moved from `apps/coffee/supabase/` to the root `supabase/migrations/` — one
project, one history.

**3. You added `coffee` to the CI matrix yourself.** That is the thing most likely to be forgotten,
and a fifth app would otherwise have shipped silently untested. Credit where due.

`build (coffee)` still needs adding to branch protection's required checks — the rule names four
jobs and the matrix runs five. That one is the TD's.

## Your app has no home yet

`tp-coffee-app` exists but points at the **repo root** rather than at an app, so it builds nothing
and serves an empty page publicly at `tech-paddock.vercel.app` — **outside the password gate**,
because the gate lives in each app's middleware and a project with no app has no middleware.

Your merge unblocked the fix; the fix itself is Joel's, since it is live infrastructure: Root
Directory → `apps/coffee`, framework → Next.js, env vars including `ANTHROPIC_API_KEY` (no longer
editor-only — the brief records that now), and attach `coffee.techpaddock.io`.

**Until that happens your app is code without a deploy.** Worth chasing rather than building more
on top of it.

## What your design got right — keep it

**The no-invented-recipes rule is enforced in `lib/guide.ts`, not in the prompt.** A prompt can only
ask. `validateGuide` drops parameters with no backing quote, rejects quotes citing pages the model
never reported reading, refuses anything read off a site that is not the roaster's, and makes tier 1
earned rather than claimed. That is the right shape: the model proposes, deterministic code decides.

The three-tier search — this coffee's own recipe, then the roaster's house guide from their own
domain only, then "none" — with the tier recorded, is also right. A house pour-over ratio is not
what the roaster decided about this particular lot, and storing which tier answered preserves that
distinction.

Keeping `guide_*` (what the roaster published) separate from `my_*` (what you dialed in) means an
adjustment never overwrites what the roaster actually said. Keep that.

## What you must not touch

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, anything touching
  `SESSION_SECRET`. Byte-identical in four apps; a mismatch silently rejects valid sessions on the
  others. Copy them as-is for your app; do not modify them.
- Schema changes without a migration file in the same PR. You will need a `coffee` schema — that is
  a seventh schema in the shared project, so coordinate with the Supabase agent and get the
  migration checked in. **Never let the database be the only record of its own shape.**
- Another app's folder without declaring it. Your branch currently touches `apps/home` and
  `apps/editor`; declare that blast radius in the PR.

## Next steps

1. **Chase the Vercel setup.** Nothing you build reaches anyone until `tp-coffee-app` points at
   `apps/coffee`.
2. **Verify the search step on a deploy preview with a real bag.** It cannot be exercised from a
   Claude Code sandbox — roaster domains are blocked by the egress proxy — so the tiering and the
   quote validation have never run against a live page. The tests cover the logic, not the reality.
3. Only then consider the deferred tables: brew log, timer, inventory, method lookup. The schema
   deliberately pre-empts none of them.
