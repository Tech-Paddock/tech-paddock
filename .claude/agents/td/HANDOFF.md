# Technical Director — handoff

State as of 2026-09-16, 00:20 UTC.

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

## Nothing is open. One branch is pushed and waiting for Joel to ask

**No pull request is open.** #56 and #57 merged on 09-14/15, and #62 to #67 merged in one ordered run
late on 09-15. `main` is at `76971bf` and every Vercel project has rebuilt from it.

**`claude/brief-ledger-current` is pushed with no pull request, and that is correct.** It carries this
ledger's current state and nothing else. The rule is that a finished branch is the deliverable and
Joel decides when a pull request exists, so it waits. CI runs on every branch push, so it is built and
tested while it waits, and a branch affects no deployed app.
**One consequence is visible rather than merely filed:** the Pit Wall renders the ledger's *Waiting on
Joel* section from `main` at build time, so until this branch merges the homepage shows the older
list. That is the cost of the rule, not a bug, and it is worth saying out loud to Joel when he next
asks what is outstanding.

**The ordering lesson from that run is the part to keep.** Five branches, none touching the same file,
and the only real constraint was that the theme-ownership rule merged **last** — landing a rule change
before the finished work written under the old rule fails that work against a rule that did not exist
when it was written. TechPad Gen's branch merged **first** for the mirror-image reason: *Require
branches to be up to date* means whichever merges second pays the re-take, and the cost belongs on the
branches still in hand, which were all mine.

**#56 and #43 are closed out.** The template archive merged with its migration applied at the gate
first, and the charter amendment it asked for was ratified in #63. The hub re-theme's three failures —
the handoff conflict, CI absent rather than red because GitHub cannot build a conflicted merge ref,
and a body restating production's commit from a stale branch — are kept in the ledger as the case that
proved the handoff rule, not as live work.

## `.claude/worklogs/` is empty of worklogs, and that is the baseline now

Three files: `README.md`, `_open-items.md`, `read-all.sh`. Every branch is merged and deleted except
`claude/brief-ledger-current`, so all fifteen worklogs named branches that no longer existed and all
fifteen are gone.

**The TD deleted its own six and left the other nine; Joel said delete those too.** The reasoning for
leaving them was that the README says to move anything durable into that agent's `HANDOFF.md` *before*
deleting, and the TD cannot assert on another agent's behalf that it happened. **That reasoning was
sound and Joel overruled it, which is his call, so it is settled — do not relitigate it.** What the
next TD should take from it is the cheaper version: check the worklogs for a live *Need from TD* before
deleting, which costs one grep, and carry anything unanswered into the ledger.

**That check found three and it was worth running.** Two were already answered by `CLAUDE.md` as it now
stands — Coffee's model exception, closed by *Model choice is per task*, and project-wide
installability, closed by the Safari paragraph that says not to add a manifest on the strength of that
rule. TechPad Gen's theme-ownership ask was closed by #66. One genuinely unfinished item survived —
Coffee's iOS install is unverified on a real phone — and it is now a Waiting on Joel item in the
ledger rather than lost with the file.

**Keep it at this baseline.** A worklog is deleted by its own agent when its branch merges; the pile
accumulated because that step was skipped at fifteen merges in a row, not because the rule is unclear.
The Pit Wall declares `worklog` as a source type but does not read these files yet, so nothing on the
homepage depends on them either way.

## A merged branch can come back, and it comes back carrying everything

**2026-09-15.** GitHub auto-deleted #56's branch on merge; the Resume Formatter pushed thirteen
seconds later and git **recreated** it. A push to a deleted branch is a branch creation, not an
error, so nothing refused it.

**What comes back is not the one late commit.** Because the merge was a squash, the resurrected
branch carries its entire pre-squash history — a pull request from it would claim 18 files and 1,402
lines, the whole change again, while its actual content difference from `main` was two files. Check
both before believing either: `git diff main branch` for what is really different,
`git diff main...branch` for what a pull request would show. When they disagree by that much, the
branch is a squash ghost and the answer is a fresh branch off `main`, never a pull request from this
one.

**The cause was mine and it is easy to repeat.** I pushed a banner onto their branch saying the
rewrite was theirs to finish, then merged that branch three minutes later. No agent can see a pull
request change state, so from their side the place to work simply vanished mid-edit. **Do not leave
a to-do on a branch you are about to merge** — either the note names a fresh branch, or the merge
waits for the work.

Deleting the resurrected branch by hand still needs Joel: the git proxy refuses `--delete` with a
403, tested again on 2026-09-15 rather than assumed.

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
`requested-by-joel`. `Vercel – tp-coffee-app` was on that list and has been removed.

**Do not repeat the reason I first gave for that, because it was wrong.** I claimed a skipped Vercel
build posts no status and that requiring it would have blocked every Coffee pull request forever.
It does post one: **`success`, with the description "Canceled by Ignored Build Step."** Confirmed on
#56's own checks. A required Vercel check would have been satisfied.

The reason that survives is weaker and still sufficient: a deployment status is not a test, and
requiring one for a single app out of five was arbitrary and written down nowhere. Keep it off the
list on those grounds. **And note how that error happened — the mechanism was inferred rather than
read, inside a warning about checks that fail to report.** Read the status.

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
2. **Set `CRON_SECRET` first, then `MS_GRAPH_*`** on `tp-tracker` — the order is not cosmetic. The
   middleware exempts `/api/cron/*` from the password gate and the route's guard fails open when
   `CRON_SECRET` is unset, so setting the Graph credentials alone publishes an unauthenticated
   endpoint that creates To Do items on demand. Harmless today only because Graph is unconfigured.
3. **Add `build (coffee)` to branch protection's required checks.** The matrix is five jobs; the
   rule names four.
4. **Run `supabase link` and `migration list` once, locally.** Expect eight local matching remote
   with `20260908235234` remote-only. That gap is deliberate. Do not repair it.

## Decisions made today

- **Draft pull requests were proposed and declined. The rule is unchanged: agents push a finished
  branch and wait for Joel to ask.** Raised by the TD on 2026-09-16 — let agents open a draft when
  work is finished, since GitHub disables the merge button on a draft and that is a *mechanical*
  guard where today there is only honesty. Joel declined: **"I'm fine having them wait for me to
  instruct on PRs. It feels cleaner."**
  **This is settled. Do not re-propose it**, and do not treat the argument below as an open question
  — it is recorded so the next session recognises the idea instead of rediscovering it.
  What the proposal got right and still does not change the outcome: a finished branch is invisible
  in the GitHub UI, so the only record one exists is a chat message. That cost is accepted.
  **What it would have required, if it is ever revived:** `pr-requested.yml` fires on
  `opened/reopened/edited/synchronize` and would go red on every draft, because no request exists at
  open time. It would need `ready_for_review` added and a skip while `draft == true`. Landing the
  brief change without the workflow change teaches agents to ignore a red `requested-by-joel`, which
  is worse than the rule it replaces. **Both or neither.**

- **The re-extract fix is approved, and it is the Resume Formatter's to build.** Joel said yes on
  2026-09-15. Resolving a template's spec by re-extracting from the stored `.docx` at render time,
  instead of reading the `spec` column, ends the re-upload-after-every-spec-change step for good;
  `renders.template_snapshot` already preserves reproducibility. **Recorded in
  `.claude/agents/resume/HANDOFF.md` as their next step and deliberately not started here** —
  `apps/resume` is theirs, and the `apps/home` override Joel gave for the Pit Wall was a single
  bypass, not a precedent. The handoff previously said the fix was "not built: he did not ask", which
  became wrong the moment he asked; correcting a sentence only the TD could have heard is the TD's
  job, because the repo is the only channel between agents.
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
