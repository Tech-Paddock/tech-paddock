# Agent: Coffee

You own `apps/coffee` — a bag scanner and brewing library. Photograph a bag, confirm what was read
off the label, find the roaster's own brewing instructions, save it to a searchable library.

**This app is not merged yet.** It exists only on `claude/coffee-brewing-assistant-hmvffw`, seven
commits ahead of `main`, and it is last in the merge queue.

## Before you write anything

Read `CLAUDE.md`; the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh`. Open
your worklog at `.claude/worklogs/<your-branch>.md`.

## Three things to fix before this branch can merge

**1. Drop your naming proposal from `CLAUDE.md`.** Your branch rewrites the Domain Map to bare names
(`editor`, `coffee`) and states a convention that the live Vercel account contradicts — the real
projects are `tp-home`, `tp-message-editor`, `tp-tracker`, `tp-resume`. The decision is made: the
`tp-` prefix stays, and the brief has already been corrected to match reality. Renaming five live
projects to satisfy a document is backwards.

**2. You may not edit `CLAUDE.md` at all** under the current rules. Flag contradictions in the PR
and stop; the brief is approved before it is updated. Your branch's other `CLAUDE.md` edits need
lifting out and raising as flags.

**3. Add `coffee` to the CI matrix.** `.github/workflows/ci.yml` hardcodes
`[home, editor, resume, tracker]`. A fifth app under `apps/` is **silently untested** — it does not
fail, it simply never runs, and nothing tells you. Your branch already touches that file; make sure
it actually adds the entry, and that branch protection's required checks are updated to include
`build (coffee)` afterwards (that part is the TD's, but remind them).

## The Vercel project waiting for you

`tp-coffee-app` already exists. It was created by Vercel's import-suggestion flow with its Root
Directory pointed at the **repo root** rather than at an app, so it builds nothing and currently
serves an empty page publicly at `tech-paddock.vercel.app` — **outside the password gate**, because
the gate lives in each app's middleware and a project with no app has no middleware.

Joel's decision: fix in place, do not delete. It unblocks the moment `apps/coffee` lands on `main`.
Then the Vercel config agent points Root Directory at `apps/coffee`, sets the framework, and adds
env vars. Your merge is what unblocks it.

Your app will need `ANTHROPIC_API_KEY`, which until now was editor-only. Say so explicitly in your
PR — it changes the env var table in the brief, which is a flag, not an edit you make.

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

1. Lift the `CLAUDE.md` edits out; raise them as flags in the PR instead.
2. Confirm `coffee` is in the CI matrix.
3. Get the `coffee` schema migration written and checked in, with RLS enabled in the same migration
   — every new table is granted to `anon` automatically, so RLS is the only thing protecting it.
4. Rebase once the three branches ahead of you land.
5. After merge, hand off to the Vercel config agent to repoint `tp-coffee-app`.
