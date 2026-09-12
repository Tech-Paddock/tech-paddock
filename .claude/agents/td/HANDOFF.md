# Technical Director — handoff

State as of 2026-09-12, 00:45 UTC.

Read `RULES.md` first for the role. This is the workload.

**Start every session with `bash .claude/worklogs/read-all.sh`**, then lead your first message with
the open items from `_open-items.md`. A `SessionStart` hook prints that ledger into your context
automatically, so it should already be there.

---

## The deploy outage is closed

All five projects serve `0c7d882` (#33). `techpaddock.io` returns 200 from that deployment with the
password gate intact. The PII scrub (#21) is deployed with it, so the resume app's live UI no longer
serves the company name that was sitting in the undeployed backlog.

**The lesson worth carrying, because the documentation cost six hours by getting it wrong twice.**
The repo is owned by the `Tech-Paddock` org; the handoff said it had moved back to `joelb-401`, and
sent the fix to the personal installations page, which cannot reach an org-owned repo. Then, once
the org installation existed, deploys *still* did not fire — because **a project's git link is
stored on the Vercel project, not derived from the installation.** All five recorded
`link.org: "joelb-401"` and had to be disconnected and reconnected in Vercel's own Settings → Git.

**If deployments ever stop again: read `link.org` on the project before touching anything on
GitHub.** And the general form of the mistake — read the thing itself, not the document describing
it. Every correction tonight came from a build log, a route, or an API response contradicting a
document that sounded authoritative.

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

1. **Finish `tp-coffee-app`, Root Directory first.** It is still the repo root — re-proven from the
   build log after #33 deployed. Set it to `apps/coffee`; it only takes effect on the next build, so
   a push has to follow. That, not the `null` framework preset, is why `tech-paddock.vercel.app`
   serves outside the password gate — and that surface is a bare 84-byte 404, checked, so it is
   embarrassing rather than urgent. Also outstanding: `coffee.techpaddock.io` is not in its domain
   list, though the Cloudflare A record already exists. The five env vars stay API-invisible;
   `GET /api/health` on the deployed app checks them.
2. **Verify `SESSION_SECRET` parity across all five.** Now finally checkable, because all five have
   redeployed. Log in at `techpaddock.io`, open a tool from a tile; a login loop means it did not
   land on that app. No agent can read the values.
3. **Set `CRON_SECRET` first, then `MS_GRAPH_*`** on `tp-tracker` — the order is not cosmetic. The
   middleware exempts `/api/cron/*` from the password gate and the route's guard fails open when
   `CRON_SECRET` is unset, so setting the Graph credentials alone publishes an unauthenticated
   endpoint that creates To Do items on demand. Harmless today only because Graph is unconfigured.
4. **Add `build (coffee)` to branch protection's required checks.** The matrix is five jobs; the
   rule names four.
5. **Run `supabase link` and `migration list` once, locally.** Expect eight local matching remote
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
