# Decisions, mistakes and traps

**This is the only append-only file in the repo.** Everything else describes now and gets
overwritten. This describes what was settled, so it accumulates — which makes it the file most
likely to become the next 588-line ledger. It has a ceiling: **200 lines.** When an entry stops
being something anyone would plausibly reopen or repeat, delete it. Git keeps it.

**Not read at session start.** Read it when you are about to reopen a decision, or when you have
just been bitten by something and want to know whether it is known.

---

## Settled — do not reopen

- **2026-09-11 — Microsoft To Do, not Google Tasks.** One Azure registration serves both calendar
  and tasks; Google meant a second OAuth setup for no extra capability.
- **2026-09-11 — The `tp-` prefix on Vercel project names stays.** Renaming live projects to tidy a
  document was proposed and declined. The document gets corrected instead.
- **2026-09-11 — Supabase and Vercel Config merged into Platform Config.** The seam leaked: the
  database's credentials live in Vercel.
- **2026-09-11 — The Message Editor's three brief contradictions: ratified.** Tone is a picklist,
  there is no Effort toggle and there will not be one, Context is a supported input. In its charter.
- **2026-09-14 — Template deletion, ending append-only.** A template with no renders is nobody's
  history. Deletion is still refused for any template a render points at.
- **2026-09-15 — Silver Arrows dropped from the livery book; Clark replaces it.** Two things
  disqualify a livery: mass casualties and a regime. Le Mans 1955 killed 83 spectators, and the name
  belongs to the Nazi-funded 1934-39 teams. **This is not a no-dead-drivers rule** — Senna stayed,
  and Peterson, Villeneuve and Rindt are all in the book.
- **2026-09-16 — The Morning Paper is a Pit Wall tab, not a route and not an app.** Moving it to The
  Garage was proposed and rejected: it answers *what needs me now*, The Garage answers *declared
  versus reported*, and one label cannot carry both. **Superseded 2026-09-18 on the tab order** —
  `Pit Wall · Paper`. Feed is deleted, and the tab that was called Board is called Pit Wall.
- **2026-09-16 — The Paper leads with what is owed, not what arrived.** Threads gone quiet are a
  task; replies received are a statistic. **The privacy fold was lifted the same day**, by Joel:
  *"drop above the fold below, ill manage privacy."* So what is owed leads the page, job search
  included, and **the layout enforces no privacy boundary** — he manages that himself, two days a
  week, by choosing when to open it. Do not reintroduce a fold as a safety feature; it was removed
  on purpose and the first half of this decision is what survives.
- **2026-09-16 — Stale must be loud.** Past 3× its cadence a panel is struck through and banners
  itself. Cached data is fine; an honest timestamp nobody reads is not the fix.
- **2026-09-16 — X/Twitter parked before it was built.** Access was never the hard part — Owned
  Reads cover the reverse-chronological timeline at $0.001 per resource. Ranking is, and it is ours.
- **2026-09-15 — One livery per app, both polarities, toggle in every header.** Fixed per app, so it
  is a build-time constant; only polarity is shared, as one `paddock_mode` cookie. A Martini hub
  framing a Clark editor is the design, not a defect. **Confirmed 2026-09-16 against the Morning
  Paper**, whose Dispatch and Timing densities read like a polarity switch and are not one: density
  is a separate axis, both densities get both polarities, and the site-wide toggle still carries
  polarity alone.
- **2026-09-15 — The branch-name action prefix: parked.** `claude/<area>-<description>` stands. The
  part worth keeping if it is ever revived: `pr` and `mrg` are *states*, and a state cannot live in a
  branch name — the name is fixed for the life of the branch while the state moves several times a
  day. What it decays into is noise shaped like information.
- **2026-09-16 — Draft pull requests: proposed and declined.** Joel: *"I'm fine having them wait for
  me to instruct on PRs. It feels cleaner."* The accepted cost is that a finished branch is invisible
  in the GitHub UI, so the only record one exists is a chat message. If it is ever revived,
  `pr-requested.yml` needs `ready_for_review` added and a skip while `draft == true` — **both or
  neither**, because landing the rule without the workflow teaches agents to ignore a red check.
- **2026-09-15 — Jurisdiction overrides are granted case by case, in chat, and recorded in the
  repo.** Joel would rather grant crossing another agent's boundary ad hoc than write every boundary
  down in advance. The one condition is the same one `requested-by-joel` exists for: no other agent
  can see the conversation, and every agent acts as the same GitHub account, so an override that
  exists only in chat is indistinguishable from an agent deciding on its own. One line in the pull
  request body: `Override granted by Joel on YYYY-MM-DD — "what he said" — permits: <the thing>`.
  **An override reaches jurisdiction only** — whose folder, who owns what. It does not reach the
  machine-enforced gates; permission in chat will not move those.
- **2026-09-16 — Worklogs are deleted, and the concept is retired.** See the communication layer in
  `CLAUDE.md`. They were built for a message that cannot exist: a worklog's stated purpose was so a
  live agent could see what another live agent had claimed *right now*, and agents here never run at
  the same time. Every real message in one had a better home. `read-all.sh` went with them — its
  loops read `refs/remotes/origin`, and with only `main` there it had silently become a no-op that
  printed the ledger the `SessionStart` hook already prints.
- **2026-09-16 — Only the technical director subscribes to a pull request.** Joel: *"only you
  watch/subscribe prs"*. **One watcher gets the events; a second subscriber silently receives
  nothing**, so two agents offering to watch means one of them is quietly deaf to the thing it
  promised to watch. The subscription also dies with the session that made it, and the technical
  director is the one who has to be there at the merge anyway. No other agent offers it.
- **2026-09-16 — `apps/tracker` is deprecated into the Pit Wall.** Joel's call, made after the
  contradiction was put to him: `glance.ts` says the hub *"holds no database credentials and talks
  to no schema"* and serves *counts and singles, never rows*. **Both halves are amended by decision
  rather than eroded by a feature**, and that file is corrected when the work lands. The `tracker`
  schema keeps its name. **The order is not optional**: drop `build (tracker)` from the required
  checks before the folder goes or nothing merges again; the Pit Wall serves what the tool served
  before the Vercel project and DNS record go, and those have no undo; `shared.contacts` needs its
  other owner named. The parked `CRON_SECRET` hazard retires with it — that window is this app's.

## Mistakes — do not repeat

- **Merging a second change on a gate result taken before the first.** #69 and #70 were merged past
  an open #68 that had been opened while the TD worked, and #70's body asserted "#69 was the only
  thing open" — nobody had looked. The branch list had been verified clean twenty minutes earlier and
  the TD reasoned from that memory. **A branch list is not a fact you check once a session. Check the
  open list with a live call as the first step of every merge.** It cost nothing that time, which was
  luck: #68 touched 47 files across all five apps and shared none of them.
- **Merging something that contradicts a settled decision because it is green.** PR #27 passed every
  first-order check and contradicted three settled decisions; it was merged and ratified afterwards.
  **Code already written applies pressure to approve it, so the brief ends up following the code.**
  Hold it and send it back with the question put to Joel. Green is what makes it tempting.
- **Raising a concern from the design notes rather than the code.** The `/api/summary` objection was
  wrong and blocked a correct change. **Verify from the thing itself.**
- **Inventing a full SHA from a short prefix.** Done twice; the `expectedHeadSha` guard rejected both
  with a 409. Read the real SHA.
- **A heredoc delimiter reaching a commit message, twice.** The second time there was no heredoc at
  all — it was pasted into a merge tool's parameter. The first lesson failed because it was filed
  against the *mechanism*. **Read the last line of a commit message before submitting it, wherever
  it is being submitted.**
- **Writing a commit SHA into prose.** Four documents once named four different production commits,
  every one correct when written. Name where to look, not what it currently says.
- **Leaving a to-do on a branch you are about to merge.** The agent came back to a branch that had
  vanished mid-edit. Either the note names a fresh branch, or the merge waits.

## Traps — things that will bite you

- **A merged branch can come back, carrying everything.** A push to a deleted branch is a branch
  *creation*, not an error. Because merges here are squashes, the resurrected branch carries its
  whole pre-squash history: one came back claiming 1,402 lines when its real difference was two
  files. `git diff main branch` for what is really different, `git diff main...branch` for what a
  pull request would show. When they disagree by that much it is a squash ghost — cut a fresh branch.
- **A squash merge conflicts the rest of its own stack**, with no real disagreement in any file.
  Before resolving, compare the base branch's copy of each conflicted file against what the stacked
  branch inherited: identical means taking the branch side is lossless as a fact rather than a
  judgement. Not identical means it is a real conflict and belongs to its author.
- **A green `build (app)` no longer means that app was built.** Since #57 each job compares its own
  folder against the merge base and exits early, still reporting success — deliberately, because a
  job skipped by a `paths:` filter never reports at all and the required check would never be
  satisfied. Read the job, not the tick. A skip says so in a step called `Nothing to do`.
- **The hosted Supabase API stamps its own migration version and ignores the filename.** That is how
  the repo and database came to disagree on four versions. Record the file's own version when
  applying, then read the history back. Local and remote must differ by exactly one — the withheld
  contacts seed. A second difference is real drift.
- **`supabase db push` cannot work here, permanently.** It refuses whenever the remote holds a
  version the local directory lacks, and `20260908235234` is remote-only for ever on purpose. The TD
  applies migrations through the hosted API at gate time.
- **A new Postgres schema inherits no grants, and exposing it is a dashboard setting.** Three steps,
  not two: the schema, its grants, and the hosted project's Exposed schemas list. Step three lives
  nowhere in this repo and fails looking exactly like a credentials problem — it cost an hour once.
- **Vercel bakes environment variables in at build time.** A dashboard change reaches nothing until
  that project redeploys. This has caught this project out more than any other single fact.
- **A Vercel project's git link is stored on the project, not derived from the GitHub App
  installation.** A six-hour outage came from this: the installation was fixed and deploys still did
  not fire because all five projects recorded the old org. **If deployments stop, read `link.org` on
  the project before touching anything on GitHub.**
- **An empty result and an unread result must not render the same.** Three separate read paths in
  `apps/coffee` each turned a failure into a plausible empty answer. If you are adding a read path,
  check this first.
- **`SESSION_SECRET` mismatch does not throw.** It silently rejects valid sessions on the other four
  apps, and the symptom looks like a login bug rather than a config bug. Nothing verifies parity.
- **Any branch cut before 2026-09-15 still carries seven real names.** `main` was force-updated
  (`1a40550...ab660ed`) to scrub five companies and two people out of `apps/tracker` fixtures — they
  were live in the working tree, not merely in history. The local refs were cleared on 2026-09-16,
  **but the hazard returns the moment anyone revives an old branch from elsewhere**, and a fresh
  clone starts the count again.
  **Test it narrowly**, because since the theme system landed every old branch differs under
  `apps/tracker` whether or not it is dirty — a test that answers yes to everything answers nothing:

  ```
  git diff --name-only origin/main <branch> -- apps/tracker/lib/matchMeetings.ts apps/tracker/tests/
  ```

  Empty means clean. **Pushing a dirty one under its own name is the worst case**, not the safest:
  those remotes are deleted, so a push *recreates* the branch and republishes the names.
- **`APP_PASSWORD_HASH` may differ per app and still work** — bcrypt salts per hash. `SESSION_SECRET`
  may not. One password rolls out five ways; one signing key cannot.

## Known, deliberately not fixed

- **Every push still rebuilds every Vercel project.** #57 fixed the GitHub Actions half only. The
  agreed fix is one `ignoreCommand` line per app's `vercel.json`, written up in the Platform handoff
  and not landed. Note the *Skip deployments when there are no changes* toggle does **not** behave as
  its label suggests here — `tp-coffee-app` had it enabled and rebuilt twice from a `.claude/`-only
  commit. Do not plan around it.
- **`/api/health` sits behind the password gate**, so no external monitor can reach it.
- **`editor.model_status` has zero rows.** The login-time drift check has never once successfully
  written. The oldest unexplained thing in the project.
- **The hub's mobile login bug.** Opening a tool from an embedded tile re-triggers that app's login.
  **Reported on Chrome, the only browser used here** — a WebKit cookie-partitioning explanation is a
  theory about a browser that was not in the loop, and reaching for one cost a round already. Check
  what URL the iframe actually loads; still unchecked.
- **Nine objects stay reachable through `refs/pull/*`** carrying seven real names, and GitHub owns
  those refs — no API, force push or branch deletion touches them. The repo is private with zero
  forks. Accepted permanently rather than deferred; garbage collection will never remove them
  because they are reachable.
- **`resume.templates.version` is max+1 across all rows including archived.** Delete the newest and
  the next upload reuses that number, so one version can name two files over time. Renders keep a
  `template_snapshot`, so it is harmless — but it reads as a bug later.

## Before transferring the repo again

**A transfer breaks every running agent session irreversibly**, and GitHub App installations do not
travel with a repository. Both halves of that have already cost hours.

Install Claude's **and** Vercel's GitHub Apps on the destination org first, with "only select
repositories" — the org holds unrelated repos. Then stop every running session. Then move. In that
order. A session's authorized repository set is fixed when it starts, and `add_repo` refuses
cross-owner additions, so a running session cannot repair itself.

- **2026-09-18 — Feed is deleted, not parked.** It lived in the settled tab order and nowhere else,
  and shipped as a labelled empty slot that said so. Joel: *"drop the feed completely, not parked
  deprecated."* **Board is renamed Pit Wall** in the same breath, because the hub's Board tab and
  the technical director's published board were two things wearing one word, and that collision is
  what made the hub hard to talk about.
- **2026-09-18 — App surface belongs to the technical director, not TechPad Gen.** Surface is
  site-or-app: shell, navigation, whether there is an index. That is architecture with visual
  consequences, not palette — and `CLAUDE.md` enumerates the theme as *palette, tokens, type,
  spacing, component language*, none of which it is. **It is settled at standup**, alongside the
  name and the schema, because it fixes things that are expensive to change afterwards.
- **2026-09-18 — Every agent publishes its own debrief board; the sign-off leaves chat.** The old
  rule reserved a board for the technical director because *"a page published from one session
  cannot be republished from another"* — **that was wrong**: another session updates a page by
  passing its URL. So each agent gets a durable URL, carried in its kickoff block, and the real
  risk was never the link count but sprawl from agents that do not know their own URL. **A row an
  agent did not measure is left untouched**, which is what lets a board carry state across sessions.
- **2026-09-18 — `tp-health` is wired and ledger items 1 and 2 are closed, with step (d) never
  proved.** Root Directory, the domain, all four environment variables and a successful login are
  each measured. **What is not**: whether `health` is on Supabase's exposed-schemas list. Nothing
  queries yet, so nothing can fail yet — `/api/health` is the first route that imports
  `getServiceClient` and is therefore the test. **If a Health query ever returns a permissions error
  that reads like a bad key, this is the cause and no further diagnosis is needed.** Closed on Joel's
  word rather than on evidence, recorded here so the gap is findable rather than forgotten.
- **2026-09-18 — Merging and deploying came apart, and `ignoreCommand` is why.** Each app's
  `vercel.json` says *skip previews, build everything else*; it cannot see which folder changed, so
  **every merge to `main` rebuilds every app**. Three merges four minutes apart raced, and
  **Vercel aliases whichever build finishes last, not whichever commit is newest** — `techpaddock.io`
  ended up on the Coffee-icon build rather than the hub change that merged after it. The fix was to
  promote the correct deployment. **The trap generalises: any two merges close together can leave an
  app serving the older one**, silently, with CI green and the branch deleted. Now ledger item 9.
- **2026-09-19 — Ledger numbers are permanent, and closing an item leaves a gap.** They used to be
  positional: close one and everything below shifted up on the next write. **That happened four times
  on 2026-09-19** and broke a parked row's cross-reference, three numbers in the TD's handoff, the
  entry directly above this one, and live references in two agents' branches — each pointing
  confidently at the wrong item rather than at nothing, which is the failure the `#` column exists to
  prevent. The ledger now carries `Next number:` and a new item takes it. **Numbering restarted at 15
  because 1–14 had each meant several things that day.** `drift` fails a reuse, a duplicate, or a
  renumber — the last by comparing titles against `origin/main`, since a tidy 1..N renumber is
  otherwise indistinguishable from a correct file.
- **2026-09-19 — `tp-message-editor` is paused on purpose; its `BLOCKED` deployments are not a bug.**
  Joel paused it because he is not using the Message Editor and does not want to spend attention on
  it. Every production deployment since reads `BLOCKED`, on every commit, so `editor.techpaddock.io`
  serves whatever was live before the pause. **Do not investigate it and do not unpause it to make a
  check go green.** `apps/editor` still builds in CI — the matrix comes from the folders on disk —
  and #129 removed it from the hub's roster the same day. **Paused is reversible and deleted is
  not**, which is the same reasoning that keeps `tp-tracker` parked.

- **2026-09-19 — a `drift` check is not finished until it has failed the case it exists to catch AND
  passed the next legitimate edit.** Two checks shipped wrong in two days. The permanent-numbers
  check passed a clean 1..N renumber, which is ascending and unique, until a title comparison against
  `origin/main` was added. Then it read the ledger as one list and **failed the very first item added
  under it**, because sections group by blocker while a new number is always the highest — so 15 in
  `Waiting on Joel` sits above 2 in `Waiting on an agent`. Ascending is now per section. **A check
  that fails a correct edit is worse than no check**: the way past it is to renumber, which is the
  thing it exists to prevent. The roster check had the mirror flaw — it required a determiner, so
  "five apps means five agents" went unseen through three re-measures of the item that existed to
  find it. It now measures the cardinal against `apps/` instead of flagging any number.
- **2026-09-19 — Vercel project state was read wrong twice and both readings reached the repo as
  fact. Read DEPLOYMENT STATE, never a project field.** `BLOCKED` on every commit is paused
  (`tp-message-editor`); `READY` at `target: production` is not (`tp-tracker`, on 4133904);
  `CANCELED` at `target: null` is `ignoreCommand` skipping a preview. `live: false` does not mean
  paused — `tp-home` reads it while serving `techpaddock.io` — yet ledger item 11 rested on
  "unreachable while paused". `framework: null` does not mean a broken Root Directory — `tp-health`
  reads null, skips previews from its own `vercel.json`, builds `READY`, and serves a `verified`
  `health.techpaddock.io`. **Health is live**, and was called unreachable for a day on that field.
