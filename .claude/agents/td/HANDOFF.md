# Technical Director — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first for the role. This is the workload.

**Start every session with `bash .claude/worklogs/read-all.sh`**, then lead your first message with
the open items from `_open-items.md`. A `SessionStart` hook prints that ledger into your context
automatically, so it should already be there.

---

## The largest live problem

**Production has not deployed since 17:48 today.** Eleven pull requests merged to `main` after that
and none of them shipped. `editor.techpaddock.io` and the rest are serving commit `92c1ec1`.

Diagnosis, evidence and fix are in `.claude/agents/platform/HANDOFF.md` — it is that agent's to
carry, and Joel's to unblock, because it needs a GitHub App installation only he can restore. Your
job is to keep it visible until it is fixed and not to let anything be declared verified against a
live URL in the meantime. **What is deployed is not what is on `main`.**

The PII scrub (#21) is in that backlog. A real company name is still being served in the resume
app's live UI, behind the password gate.

## The queue

Nothing is in flight. `main` is at `fdbc4bf`.

**Open on this branch:** the agent documentation restructure — `CLAUDE.md` cut to routing and
universal rules, seven agent folders each carrying charter, handoff and kickoff. The nine
superseded briefs it replaces have been deleted in the same change. Not merged as of this writing.

**PR #28 is open and should be closed.** It is the superseded original of the Coffee app, 7 ahead
and 14 behind, already conflicting. Details in `.claude/agents/coffee/HANDOFF.md`. Closing it needs
a comment explaining that #23 superseded it, so its author is not left guessing.

**Three branches are dead** and need deleting in the GitHub UI — the git proxy returns 403 on
`--delete` while permitting pushes: `coffee-brewing-assistant-hmvffw`,
`tracker-dashboard-concept-r6p9up`, `resume-editor-design-wccfly` (already fully merged, 0 ahead).

## Waiting on Joel

Live infrastructure and one-time credentials. None of it is yours.

1. **Reconnect Vercel's GitHub App.** Unblocks everything else. `github.com/settings/installations`.
2. **Repoint `tp-coffee-app`** — Root Directory `apps/coffee`, framework Next.js, five env vars,
   attach `coffee.techpaddock.io`. **The only publicly exposed thing in the project** until it is
   done: `tech-paddock.vercel.app` serves an empty page outside the password gate.
3. **Verify the new `SESSION_SECRET` landed on all five projects** and that all five redeployed. It
   was rotated today. A partial rollout is the silent-SSO failure.
4. **Set `MS_GRAPH_*` and `CRON_SECRET`** on `tp-tracker`. The Microsoft To Do integration and daily
   cron shipped in #22 and are inert without them, and degrade quietly by design.
5. **Add `build (coffee)` to branch protection's required checks.** The matrix is five jobs; the
   rule names four.
6. **Run `supabase link` and `migration list` once, locally.** Expect eight local matching remote
   with `20260908235234` remote-only. That gap is deliberate. Do not repair it.

## Decisions made today

- **Google Tasks → Microsoft To Do: approved.** One Azure registration serves both calendar and
  tasks; Google would have meant a second OAuth setup for no extra capability.
- **The `tp-` prefix on Vercel project names stays.** A proposal to rename live projects to bare
  names was declined; the table was corrected instead.
- **The Supabase and Vercel Config agents merged into Platform Config.** The seam between them
  leaked — the database's credentials live in Vercel.
- **PR #27's three brief contradictions: ratified by Joel** — tone as a picklist, the Effort toggle
  deliberately not built, the Context input. Settled. See the error below for why that is not a
  clean outcome.

## Two mistakes worth not repeating

**PR #27 was merged when it should have been held.** It contradicted three settled decisions in the
brief. Every first-order check passed and it was merged on that basis, with ratification asked for
afterwards. Joel's correction: reject it and kick it back to the agent to ask him. The outcome
happened to be approval; the handling was still wrong, because code already written applies
pressure to approve it. The second-order checklist now in `CLAUDE.md` exists because of this.

**The `/api/summary` concern was raised from design notes rather than code, and it was wrong.** The
carve-out is one exact path, mirrors the editor's `/api/draft` precedent, is read-only and fails
closed. It is recorded as mistaken rather than quietly dropped, because a withdrawn concern with no
explanation teaches nothing. **Verify from the code.**

## Known, deliberately not fixed

- **Every push rebuilds every Vercel project.** No Ignored Build Step. The change is written and
  agreed — one line per app's `vercel.json`, in the Platform handoff — and not landed.
- **DNS is wired two ways.** `editor` resolves through `vercel-dns-017.com`; the others use the
  legacy A record. Both work.
- **`/api/health` sits behind the password gate**, so no external monitor can reach it.
- **`editor.model_status` has zero rows.** The login-time drift check has never successfully
  written. Not diagnosed, and the oldest unexplained thing here.

## The org transfer, when it happens

Install Claude's **and** Vercel's GitHub Apps on `Tech-Paddock` first, with "only select
repositories". Then stop every running session. Then move the repo. In that order.

A session's authorized repository set is fixed when the session starts, so a transfer breaks every
running agent irreversibly — `add_repo` refuses cross-owner additions. GitHub App installations do
not travel with a repository; that is what broke deployments today and what cost about two hours
this morning.

The org already holds three unrelated repositories. Grant the apps access to `tech-paddock` only.
