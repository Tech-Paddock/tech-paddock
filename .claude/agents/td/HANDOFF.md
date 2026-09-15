# Technical Director — handoff

State as of 2026-09-15, 00:05 UTC.

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

## One pull request open, not yet gated

**#56 — template archive, delete and download, plus three renderer bugs, from Resume.** Opened
2026-09-14 22:33, green on all five matrix jobs and on `requested-by-joel`, request line present,
one app plus one migration. **Joel has not asked for it to be merged, so it has not been gated.**

**It carries a migration and the order is not optional.** `20260914221259_resume_template_archive.sql`
adds `archived_at` to `resume.templates`. Every templates query selects that column, so if the code
deploys before the migration runs, `GET /api/templates` returns 500 and takes out both the Templates
tab and the active-template lookup Reformat depends on. Apply the migration first. The pull request
body says this itself, which is what the Deployment rule was written to produce.

It also asks for a charter amendment: `resume.templates` stops being append-only. Joel approved the
behaviour on 2026-09-14; the charter edit is in the pull request and nobody has ratified it. That is
a gate decision when the gate happens.

**#43 closed out.** The hub re-theme merged on 2026-09-12 after TechPad Gen brought the branch
current; #54 then deleted the worklog it orphaned. The three failures recorded here — the handoff
conflict, CI absent rather than red because GitHub cannot build a conflicted merge ref, and a body
restating production's commit from a stale branch — are kept in the ledger as the case that proved
the handoff rule, not as live work.

**Branch deletion happens by itself now.** The note that used to live here — git proxy 403 on
`--delete`, a GitHub UI job — is stale: the repo auto-deletes head branches on merge. #39, #40, #41
and #42 all vanished without being asked. What the proxy still refuses is deleting a branch by hand,
which is now rarely needed. Prune local refs after a merge or a stale `origin/<branch>` will make
the next squash commit look unpushed.

## A green `build (app)` no longer means that app was built

Since #57, each matrix job first compares its own folder against the merge base with `main` and
exits early when nothing under `apps/<app>`, `.github/workflows` or `supabase` changed. The job
still runs and still reports success — that is the whole point, because branch protection requires
these checks by name and a job skipped by a workflow-level `paths:` filter never reports at all,
which would leave the required check permanently unsatisfied and the pull request permanently
unmergeable.

**So read the job, not the tick.** A green `build (tracker)` on a branch that never touched
`apps/tracker` means "nothing to build", and its log says so in a step called `Nothing to do`.
Pushes to `main` always build all five, because a merge commit can break an app whose folder it
never touched and `main` is what production deploys from.

**The skip path has not yet executed in CI.** Every commit on the branch that introduced it touched
`.github/workflows`, which is in scope for all five, so all five built. The logic was simulated
against four real merges (#48, #43, #47, #53) and matched every time, but the first genuine skip will
happen on the next branch that touches one app. If it is wrong it fails loudly — a broken step turns
the job red — rather than passing something untested, which is the right way round.

## Migrations have a shape rule now, and the TD applies them

Since 2026-09-14 a migration must be safe to apply **before** the code that needs it, because
merging is unattended: the merge triggers the deploy and the new code is live in about a minute, so
anything done after the merge happens while the app is already broken.

**Additive rides with its code. Destructive splits into two pull requests** — stop using the column
and ship, then drop it once that is live. **You apply it at gate time, before merging.** You have
direct database access through the hosted API and it works; an agent claiming a migration needs a
credential nobody holds has guessed, and that guess becomes a manual step that gets forgotten. It
already appeared once, in #56's body.

**The hosted API stamps its own migration version and ignores the filename.** That is how the repo
and the database came to disagree on four versions between 09-11 and 09-14. Fixed by renaming the
files to the versions that ran, not by repairing the database — the database is the record of what
happened, the repo is the record of what was intended, and when they disagree about history the repo
moves. **After applying anything through the API, check the recorded version and rename the file to
match.** Local and remote now differ by exactly one version, the withheld contacts seed, and a second
difference means real drift.

## Branch protection, as of 2026-09-15 — and the one setting that changes how you merge

Required checks are finally right: six, all GitHub Actions —
`build (editor)`, `build (home)`, `build (resume)`, `build (tracker)`, `build (coffee)`,
`requested-by-joel`. **`Vercel – tp-coffee-app` was on that list and has been removed**, which was
the important half. It was a *deployment* status, required for one app out of five, and leaving it
there while an Ignored Build Step skips Coffee's deployments would have produced a required check
that stops reporting — permanently unmergeable pull requests, arriving through the Vercel side while
the CI scoping was busy preventing exactly that failure on the GitHub side. **If a Vercel status
ever reappears in that list, take it out.**

**`Require branches to be up to date before merging` is on.** This is the setting that gives the
merge-order rule teeth: after any merge, every other open pull request is behind and must take
`main` again and re-run before it can go in. So the order you pick decides who pays, every time —
prefer merging the branch that is *finished* and let the cost fall on the one still being worked.

`Block force pushes` and `Restrict deletions` are also on, which is why a history rewrite needs Joel
to relax them first.

## The ledger has a Parked section now

Separate from "Waiting on Joel" on purpose. Waiting means someone owes an action; parked means Joel
deliberately deferred it and **it is not to be picked up as background work.** The first entry is
`CRON_SECRET` and the Graph integration, where the parked state is the *safe* one and un-parking is
the dangerous moment — read the entry before touching it.

## Waiting on Joel

Live infrastructure and one-time credentials. None of it is yours.

1. **`SESSION_SECRET` parity — confirmed good by Joel on 2026-09-14. Closed.** Kept here only for
   the mechanism, which will matter again at the next rotation: the values cannot be read back out of
   the dashboard, so parity cannot be confirmed by inspection, and a dashboard change does not reach
   a running deployment until it rebuilds. Setting one fresh known value on all five and then
   redeploying is the only way to establish it.
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

- **Every push rebuilds every Vercel project.** No Ignored Build Step. Still true, and it is now the
  *only* half that is: GitHub Actions stopped rebuilding all five in #57 (below), Vercel did not.
  The change is written and agreed — one line per app's `vercel.json`, in the Platform handoff — and
  not landed.
- **DNS is uniform as of 2026-09-12.** All four subdomains are CNAMEs to
  `d1317e1174061c29.vercel-dns-017.com`; the apex stays an A record because an apex cannot be a
  CNAME. Verified resolving, and the `frame-ancestors` header survived the switch.
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
