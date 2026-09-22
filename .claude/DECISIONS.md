# Decisions, mistakes and traps

**This is the only append-only file in the repo.** Everything else describes now and gets
overwritten. This describes what was settled, so it accumulates.

**Append inside the section that describes your entry — never at the end of the file.** On
2026-09-20 sixty-six of this file's lines were found filed under a repo-transfer runbook, which was
simply the last heading: why ledger numbers are permanent, why the editor is paused, how to read
Vercel state. Nothing was wrong with any entry and nobody would ever have found them. **There is no
default section and the last one is not it.** Pick the heading, then append under it.

**Ceiling: 400 lines**, raised from 260 on 2026-09-20 with Joel's word. **The number is deliberately
loose, because this file's budget is not the ledger's.** `.claude/OPEN-ITEMS.md` is printed into
every session by a hook, so each of its lines is paid again in every session forever and 80 is
strict on purpose. This one is **not read at session start** — read it when you are about to reopen
a decision, or when you have just been bitten and want to know whether it is known. Rationing it
only makes a settled call cheaper to relitigate than to look up, which is the failure it exists to
prevent. **So do not trim to make room.** When an entry stops being something anyone would
plausibly reopen or repeat, delete it; git keeps it.

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
- **2026-09-19 — Ledger numbers are permanent, and closing an item leaves a gap.** They used to be
  positional: close one and everything below shifted up on the next write. **That happened four times
  on 2026-09-19** and broke a parked row's cross-reference, three numbers in the TD's handoff, the
  entry directly above this one, and live references in two agents' branches — each pointing
  confidently at the wrong item rather than at nothing, which is the failure the `#` column exists to
  prevent. The ledger now carries `Next number:` and a new item takes it. **Numbering restarted at 15
  because 1–14 had each meant several things that day.** `drift` fails a reuse, a duplicate, or a
  renumber — the last by comparing titles against `origin/main`, since a tidy 1..N renumber is
  otherwise indistinguishable from a correct file.
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
- **2026-09-20 — An agent publishes only its own board. Joel walked back the merge-refresh rule.**
  On 2026-09-19 the TD was told a merge should also refresh the merged agent's board — their DevOps
  row and a dated TD banner. **Joel reversed it on 2026-09-20: "Don't push updates to other agents
  artifacts."** It never reached `CLAUDE.md`, so it lived in exactly one place, the TD's handoff,
  and it is gone from there. **The 2026-09-18 rule is untouched and still stands**: every agent
  publishes its own board, to the URL in its own kickoff block. What changes is that a merge now
  leaves the merged agent's board alone, stale or not — **their row is theirs to write, and an
  agent's board is not a channel anyone else writes to.** The TD's board remains the rollup and is
  still the only one that reports every agent; the rollup is read from the repo, never written back.
- **2026-09-20 — Preview deployments stay off, and that is what removed the `On track` stage.**
  #108 turned previews off on 2026-09-17: 65 of the last 100 deployments were previews of work still
  being thought about, on URLs nobody opened, paying Vercel to rebuild what CI had just built free.
  **`On track` was agreed the same day and existed only as the controlled exception to it** — a
  fourth phrase and a sixth DevOps colour for a branch deployed to a URL Joel could actually drive
  before deciding whether it merged. **The gap it filled is real and is still open**: all five
  stages are answered by a *decision* taken from reading a diff, and for a phone app like Coffee a
  diff says nothing about whether the thing is any good. #156 built it on `.claude/ON-TRACK`, a
  marker file every `ignoreCommand` grepped, and **Joel then ruled previews out entirely, which left
  the stage with no mechanism at all**, so it was stripped back out the same day — no marker, no
  grep, no phrase, no colour, `CLAUDE.md` untouched. **Do not rebuild it without reading ledger item
  3 first.** The honest version needs preview-scoped environment variables and a Supabase branch, so
  what is driven is not reading production data — infrastructure and money, and therefore Joel's.
  **Closing item 3 outright is a legitimate answer** and merge-then-look stays how this works.
- **`lib/models.ts` stays a per-app copy and does not go into `packages/shared`.** Settled by the
  technical director at #159's gate on 2026-09-20, when the Cookbook's copy became the third — after
  Coffee's and Health's — and its pull request flagged it and asked, which is the path `CLAUDE.md`
  sets out. **The three are not the same file, and the reason matters more than the count.** Coffee's
  exports `SEARCH_MODELS` over three models with `search`, `fetch` and an `efforts` array plus
  `effortsFor`, `isEffortFor` and `DEFAULT_EFFORT`, because Coffee has an effort dial. Health's
  exports `MODELS` over two with `search` and `fetch` and a `COMPARISON_MODEL`. The Cookbook's has
  **no `search` at all**, deliberately, because nothing in it searches — it fetches the one page you
  pasted. Diffed at the gate rather than assumed: 76, 67 and 61 lines, no two alike.
  **`packages/shared` is for files that must be byte-identical, and these must not be.**
  `scripts/stamp-shared.mjs` writes copies outward and `drift` *fails* a copy that disagrees, so
  putting this file there forces one of two bad outcomes: the stamp overwrites each app's deliberate
  differences and every app carries capabilities it decided against, or `drift` goes permanently red
  and the pressure lands on weakening the check — which the brief forbids outright. What actually
  recurs here is a **pattern** (a registry keyed by model id carrying each model's request shape),
  not a file, and duplicate-and-flag is where a pattern belongs.
  **So there is no ledger row for it**, and that is the decision rather than an omission: a row would
  carry a question that has been answered. **What is still open is the livery, item 24, not this.**
  If a fourth app ever needs the *identical* registry, reopen it then — additive, and on evidence.

- **2026-09-20 — one board, not seven. Every agent except the technical director signs off in
  chat.** Joel: *"You continue to generate paddock debrief as laid out. Everyone else no more
  paddock debriefs. I just want DevOps and open items from that agent within the body of the chat."*
  This reverses the 2026-09-18 extension that gave every agent a page of its own. **The reason he
  gave is agent turnover**, asked directly: *"With the quicker turnover of agents, it just makes
  sense."* **A board is a persistent page and an agent is no longer a persistent thing.** The 09-18
  design assumed an agent that ran for weeks and curated one page; agents are now archived and
  restarted often, so each page outlives the agent that owned it and goes stale with nobody left who
  would notice. **A table in the message he is already reading cannot outlive anything.** The
  readership evidence is the same call from the other side — a publish per agent, and he opened one. **Work Brief did not move to chat; it was dropped** for those
  agents, and what was finished goes in the prose of the answer instead. The two tables survived
  because a table is the part prose cannot carry. **The measuring rules did not change with the
  medium** — live branches, live check runs, the ledger re-read off disk, update only what you
  measured. `.claude/agents/BOARD.html` stays; it now has one caller.

- **2026-09-22 — DevOps is the technical director's, and now says so once.** It was split on
  2026-09-19 when Platform Config was retired: Postgres stayed at the gate because migrations are
  applied there, and Vercel, DNS and CI went to TechPad Gen as *deliveries* — **a reason never
  written down anywhere**. The repo then carried four answers: `CLAUDE.md`'s roster gave the TD
  "ops" *and* TechPad Gen "deliveries"; `td/RULES.md:81` said Vercel was the TD's; `:92` said to
  watch **Platform**, a seat that no longer exists. **This is not new policy — it collapses four
  statements into one.** The one argument that survived steelmanning was separation of duties, that
  a gate confirming its own merge marks its own homework; it fails here because the independent
  re-read is a fresh session reading the same repo, which a fresh **TD** session does equally well
  without a second charter to keep current. **The Vercel trap list moves with the seat, verbatim**,
  or the move relocates the error it exists to prevent.
- **2026-09-22 — Linear holds open items. GitHub stays the repo. The board is deleted.** Linear
  becomes canonical and a Routine generates `.claude/OPEN-ITEMS.md` from it, so the `SessionStart`
  hook still prints it and **agents read for free — no credential, no network call at session
  start.** Writing an item calls Linear; reading never does. **`BOARD.html` goes with it**, which is
  the 2026-09-20 reasoning finished: a board is a persistent page and agents are not persistent
  things, so once Linear holds the queue and GitHub holds the pull requests the last board is a
  third copy of state two systems already render live. **Migration cost, measured: 17 references to
  ledger numbers across 8 files, four of them — items 7, 9, 19, 27 — pointing at items already
  closed**, which Linear will not hold. Decide deliberately whether those carry or are rewritten.
- **2026-09-22 — No deployment agent.** Proposed and declined. The decisive objection: `CLAUDE.md`
  puts migrations at the gate, so an agent that merges must also apply them — rebuilding the split
  that was deliberately rejected, in the other direction. The second: the gate's value is the
  second-order pass, and **a narrow charter is by construction the agent least able to run it**;
  widen it and the cheap checkout that motivated the seat is gone.
- **2026-09-22 — The sign-off is deleted, not computed.** *Supersedes "computed, not specified",
  the same day.* The spec was **27.9% of `CLAUDE.md`**, and a script was the only replacement that
  recovered the cost. **Joel stopped the debrief outright instead**, and then removed the status
  rule too — no board, no footer, no status spec of any kind. Permanent ledger numbers survive only
  as `drift`'s check. `BOARD.html` went with it, ahead of Linear's Phase 2.

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
- **`npm run lint` has no config in any app here, and none is in CI.** Every app carries the Next.js
  boilerplate script and not one has an ESLint config behind it, so a local `lint` fails looking
  exactly like a broken setup. It is boilerplate, not a break — and because CI never runs it, a
  green pipeline says nothing about it either way.
- **"Invalid API key" in the Cookbook is Supabase, not Anthropic.** Reading the book or the shopping
  list calls no model at all — the only model calls are drafting a recipe and Tidy. Reaching for the
  Anthropic key when the book will not load cost a wrong turn once.
- **A failed read must never render as an empty collection.** "Nothing here" and "we could not look"
  are opposite facts that draw the identical screen, and the empty one is the confident lie. The
  Cookbook's pattern: `LookupError` becomes a 503 and the client leaves its state `null` rather than
  `[]`, so an unread book cannot be mistaken for an empty one. Anything that lists rows wants this.

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
- **2026-09-18 — Merging and deploying came apart, and `ignoreCommand` is why.** Each app's
  `vercel.json` says *skip previews, build everything else*; it cannot see which folder changed, so
  **every merge to `main` rebuilds every app**. Three merges four minutes apart raced, and
  **Vercel aliases whichever build finishes last, not whichever commit is newest** — `techpaddock.io`
  ended up on the Coffee-icon build rather than the hub change that merged after it. The fix was to
  promote the correct deployment. **The trap generalises: any two merges close together can leave an
  app serving the older one**, silently, with CI green and the branch deleted. Now ledger item 9.
- **2026-09-19 — Vercel project state was read wrong twice and both readings reached the repo as
  fact. Read DEPLOYMENT STATE, never a project field.** `BLOCKED` on every commit is paused
  (`tp-message-editor`); `READY` at `target: production` is not (`tp-tracker`, on 4133904);
  `CANCELED` at `target: null` is `ignoreCommand` skipping a preview. `live: false` does not mean
  paused — `tp-home` reads it while serving `techpaddock.io` — yet ledger item 11 rested on
  "unreachable while paused". `framework: null` does not mean a broken Root Directory — `tp-health`
  reads null, skips previews from its own `vercel.json`, builds `READY`, and serves a `verified`
  `health.techpaddock.io`. **Health is live**, and was called unreachable for a day on that field.
- **2026-09-20 — Vercel's Redeploy button is a no-op in this repo, for every app.** The Ignored
  Build Step is a pure function of `HEAD^..HEAD`, so re-running it on the same commit returns the
  same answer every time, and an empty commit produces the same empty diff. **That makes an
  environment variable impossible to pick up from the dashboard** — a deployment's env snapshot is
  taken when it is *created*, so editing a variable changes nothing until a new build exists. It
  cost the Cookbook its bring-up: `tp-cookbook` served the `5c7a399` build, correct and live, while
  three redeploys carrying `ANTHROPIC_API_KEY` were cancelled in turn. **The proof that nothing was
  broken is `tp-home` on `68ffc52`** — alone among the seven it watches `.claude`, and alone among
  the seven it built. Six apps skipping a docs-only merge is the feature working.
  **The fix, landed the same day: every `ignoreCommand` now reads `FORCE_BUILD`.** Set it to
  anything on the Vercel project, redeploy, remove it. It sits **after the preview check and before
  the diff**, so it forces production only and previews stay ruled out — a separate settled call it
  must not quietly undo. **It cost 43 characters**, taking the longest command from 175 to 218, and
  **moved `drift`'s warn band from 200 to 235** because seven permanent warns would have been worse
  than none: a band nobody can clear is a band everybody learns to scroll past. The hard fail at 256
  is the real guard and is unchanged. **From git the way out is still a commit touching that app's
  folder or `packages`**, and `packages` rebuilds all seven at once, which is why it rides in every
  pathspec.
- **2026-09-20 — the measurement behind `CLAUDE.md`'s "the proxy refuses it", so nobody re-tests
  it.** That file already says an agent cannot delete a remote branch here; what it does not say is
  how the refusal arrives, which is why it gets tried anyway. **`git push origin --delete` hangs up
  mid-sideband** — `send-pack: unexpected disconnect`, which reads like a network blip and invites
  a retry. **`DELETE /git/refs/heads/...` returns 403, "Write access to this GitHub API path is not
  permitted through this proxy."** Four attempts each, on 2026-09-20. **Pushes that create or update
  a ref work fine**, which is what makes the deletion case surprising. Neither is transient: stop
  after the first and ask Joel.
- **The TD's handoff-freshness check is structurally dead.** `drift-check.mjs:311` maps `td` to
  `["apps/editor"]` — the **frozen** app — so it reports `ok` forever. Measured 2026-09-22: it said
  `ok fresh: td 2026-09-20, current with apps/editor` while the handoff was two merges stale. The
  guard above it covers an agent owning *no* folder; the TD owns an *inert* one and falls past it.
- **The ledger is not reliably machine-parseable and fails silently.** A parse written 2026-09-22
  returned **9 items where there are 10** — item 1's title wraps, so the `**…**` never closes on the
  numbered line and it was dropped with no error. Any script reading this file must **exit non-zero
  on an unparseable item** and cross-check its count against `Next number`.
- **CI's build scope check does not watch `packages/`.** `ci.yml:94-97` names `apps/<app>`,
  `.github/workflows` and `supabase`; every app's Vercel `ignoreCommand` does include `packages`.
  Latent only because stamping writes into `apps/` too, so `drift` is what actually catches it.
  **Concrete evidence for ledger item 20.**
## Known, deliberately not fixed

- **Vercel's *Skip deployments when there are no changes* toggle does not behave as its label
  suggests here.** `tp-coffee-app` had it enabled and rebuilt twice from a `.claude/`-only commit.
  Do not plan around it; the `ignoreCommand` in each app's `vercel.json` is what actually scopes a
  build, and all seven carry one. *This bullet used to say that fix was agreed and not landed. It
  has been landed since 2026-09-19, proved itself on 2026-09-20, and the claim outlived it.*
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
- **2026-09-18 — `tp-health` is wired and ledger items 1 and 2 are closed, with step (d) never
  proved.** Root Directory, the domain, all four environment variables and a successful login are
  each measured. **What is not**: whether `health` is on Supabase's exposed-schemas list. Nothing
  queries yet, so nothing can fail yet — `/api/health` is the first route that imports
  `getServiceClient` and is therefore the test. **If a Health query ever returns a permissions error
  that reads like a bad key, this is the cause and no further diagnosis is needed.** Closed on Joel's
  word rather than on evidence, recorded here so the gap is findable rather than forgotten.
- **2026-09-19 — `tp-message-editor` is paused on purpose; its `BLOCKED` deployments are not a bug.**
  Joel paused it because he is not using the Message Editor and does not want to spend attention on
  it. Every production deployment since reads `BLOCKED`, on every commit, so `editor.techpaddock.io`
  serves whatever was live before the pause. **Do not investigate it and do not unpause it to make a
  check go green.** `apps/editor` still builds in CI — the matrix comes from the folders on disk —
  and #129 removed it from the hub's roster the same day. **Paused is reversible and deleted is
  not**, which is the same reasoning that keeps `tp-tracker` parked.
