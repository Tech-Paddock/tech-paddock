# Technical Director — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first for the role. This is the workload.

**Start every session with `bash .claude/worklogs/read-all.sh`**, then lead your first message with
the open items from `_open-items.md`. A `SessionStart` hook prints that ledger into your context
automatically, so it should already be there.

---

## The largest live problem

**Production has not deployed since 17:48 today.** `editor.techpaddock.io` and the rest serve commit
`92c1ec1`, and everything merged since is undeployed — check the commit, not a count, because the
count grows on every merge. Verified at 23:45: zero deployments on any of the five projects since
17:54, across three merged pull requests.

Diagnosis, evidence and fix are in `.claude/agents/platform/HANDOFF.md` — it is that agent's to
carry, and Joel's to unblock, because it needs a GitHub App installation only he can restore. Your
job is to keep it visible until it is fixed and not to let anything be declared verified against a
live URL in the meantime. **What is deployed is not what is on `main`.**

The PII scrub (#21) is in that backlog. A real company name is still being served in the resume
app's live UI, behind the password gate.

## The queue is empty

Zero open pull requests. `main` carries the full agent documentation restructure (#29, #30), the
Coffee health check (#31), and Joel's two direct commits deleting the orphaned worklogs.

PR #28 was closed as superseded, with the reasoning posted on the pull request rather than only in
this file, and every dead branch has been deleted.

**Branch deletion is not something you can do.** The git proxy returns 403 on `--delete` while
permitting pushes, and no GitHub tool in this session exposes it. It is a GitHub UI job, so say so
rather than promising it.

## Waiting on Joel

Live infrastructure and one-time credentials. None of it is yours.

1. **Reconnect Vercel's GitHub App.** Unblocks everything else. The repo is org-owned, so the page
   is `github.com/organizations/Tech-Paddock/settings/installations` — **not** the personal
   `github.com/settings/installations`, which cannot reach an org-owned repo. Installed on the org
   2026-09-12; a new push to `main` is still required before anything deploys.
2. **Finish `tp-coffee-app`. Partly done.** Verifiably outstanding: framework preset is still
   `null`, and `coffee.techpaddock.io` is not in its domain list. Root Directory and the five
   env vars are not API-visible, so `GET /api/health` on the deployed app is how to check them.
   The Cloudflare DNS record already exists. **Still the only publicly exposed thing in the
   project** until Root Directory points at a real app.
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
