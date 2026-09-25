# Decisions, mistakes and traps

**This is the only file that accumulates.** Everything else describes now and gets overwritten. This
describes what was settled, so it grows.

**Append inside the section that describes your entry — never at the end of the file.** On
2026-09-20 sixty-six of this file's lines were found filed under a repo-transfer runbook, which was
simply the last heading: why ledger numbers are permanent, why the editor is paused, how to read
Vercel state. Nothing was wrong with any entry and nobody would ever have found them. **There is no
default section and the last one is not it.** Pick the heading, then append under it.

**Supersede in place.** When a decision reverses an entry, edit that entry to say so — a
contradiction appended below the original is two answers to one question, and the first one found
wins.

**Ceiling: 400 lines**, raised from 260 on 2026-09-20 with Joel's word, and deliberately loose. This
file is **not read at session start** — read it when you are about to reopen a decision, or when you
have just been bitten and want to know whether it is known. Rationing it only makes a settled call
cheaper to relitigate than to look up, which is the failure it exists to prevent. **So do not trim
to make room.** When an entry stops being something anyone would plausibly reopen or repeat, delete
it; git keeps it.

---

## Settled — do not reopen

- **2026-09-11 — Microsoft To Do, not Google Tasks.** One Azure registration serves both calendar
  and tasks; Google meant a second OAuth setup for no extra capability.
- **2026-09-11 — The `tp-` prefix on Vercel project names stays.** Renaming live projects to tidy a
  document was proposed and declined. The document gets corrected instead.
- **2026-09-11 — The Message Editor's three contradictions with CLAUDE.md: ratified.** Tone is a
  picklist, there is no Effort toggle and there will not be one, Context is a supported input.
  Recorded here since the editor's charter went with its agent (#149); the code carries them.
- **2026-09-14 — Template deletion, ending append-only.** A template with no renders is nobody's
  history. Deletion is still refused for any template a render points at. *Superseded 2026-09-17 on
  the second half: renders outlive their template (#107, migration `20260918041216`); deleting the
  active template is what is refused.*
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
  loops read `refs/remotes/origin`, and with only `main` there it had silently become a no-op.
- **2026-09-16 — Only the technical director subscribes to a pull request.** Joel: *"only you
  watch/subscribe prs"*. **One watcher gets the events; a second subscriber silently receives
  nothing**, so two agents offering to watch means one of them is quietly deaf to the thing it
  promised to watch. The subscription also dies with the session that made it, and the technical
  director is the one who has to be there at the merge anyway. No other agent offers it.
- **2026-09-16 — `apps/tracker` is deprecated into the Pit Wall.** *Superseded 2026-09-24: the
  tracker is **parked**, not deprecated.* Joel: *"I don't know what I'm doing with tracker."* Its code
  stays and still builds in CI, it is out of the hub's `TOOLS`, and Joel pauses `tp-tracker` in
  Vercel. **Parked means nobody builds on it and nobody deletes it**; un-parking is his call. What
  survives of the original: if it is ever deprecated for real, the order is not optional — the Pit
  Wall serves what the tool served *before* the Vercel project and DNS record go, because those have
  no undo.
- **2026-09-18 — Feed is deleted, not parked.** It lived in the settled tab order and nowhere else,
  and shipped as a labelled empty slot that said so. Joel: *"drop the feed completely, not parked
  deprecated."* **Board is renamed Pit Wall** in the same breath, because the hub's Board tab and
  the technical director's published board were two things wearing one word, and that collision is
  what made the hub hard to talk about.
- **2026-09-18 — App surface belongs to the technical director, not TechPad Gen.** Surface is
  site-or-app: shell, navigation, whether there is an index. That is architecture with visual
  consequences, not palette — and `CLAUDE.md` enumerates the theme as *palette, tokens, type,
  spacing, component language*, none of which it is. **It is settled at standup**, alongside the
  name and the schema, because it fixes things that are expensive to change afterwards. **Joel can
  overrule it** (2026-09-24, when `STANDUP.md` was found listing surface among the things only he
  decides).
- **2026-09-18 → 09-22 — Debrief boards: every agent's, then the TD's alone, then none.** 09-18 gave
  every agent a published page; 09-20 cut it to the TD's; 09-22 deleted the sign-off, the board and
  `BOARD.html` outright (below). **Two things survive.** An agent writes only its own artifacts —
  Joel, 2026-09-20: *"Don't push updates to other agents artifacts."* And the reason he gave for
  cutting the boards: agents are archived and restarted often, so a persistent page outlives the
  agent that curated it and goes stale with nobody left who would notice. A table in the message he
  is already reading cannot outlive anything.
- **2026-09-19 — a `drift` check is not finished until it has failed the case it exists to catch AND
  passed the next legitimate edit.** Two checks shipped wrong in two days. A permanent-numbers check
  passed a clean 1..N renumber, which is ascending and unique; its fix then failed the very first
  item added under it, because sections grouped by blocker while a new number is always the highest.
  **A check that fails a correct edit is worse than no check**: the way past it is to do the thing it
  exists to prevent. The roster check had the mirror flaw — it required a determiner, so "five apps
  means five agents" went unseen through three re-measures. It now measures the cardinal against
  `apps/` instead of flagging any number.
- **2026-09-20 — Preview deployments stay off, and that is what removed the `On track` stage.**
  #108 turned previews off on 2026-09-17: 65 of the last 100 deployments were previews of work still
  being thought about, on URLs nobody opened, paying Vercel to rebuild what CI had just built free.
  **`On track` was agreed the same day and existed only as the controlled exception to it** — a
  stage for a branch deployed to a URL Joel could actually drive before deciding whether it merged.
  **The gap it filled is real and is still open**: a decision taken from reading a diff says nothing
  about whether a phone app like Coffee is any good. #156 built it on a marker file every
  `ignoreCommand` grepped, and **Joel then ruled previews out entirely, which left the stage with no
  mechanism at all**, so it was stripped back out the same day. **Do not rebuild it without reading
  TEC-6 first.** The honest version needs preview-scoped environment variables and a Supabase branch,
  so what is driven is not reading production data — infrastructure and money, and therefore Joel's.
  **Closing TEC-6 outright is a legitimate answer** and merge-then-look stays how this works.
- **`lib/models.ts` stays a per-app copy and does not go into `packages/shared`.** Settled by the
  technical director at #159's gate on 2026-09-20, when the Cookbook's copy became the third — after
  Coffee's and Health's — and its pull request flagged it and asked, which is the path `CLAUDE.md`
  sets out. **The three are not the same file, and the reason matters more than the count.** Coffee's
  exports `SEARCH_MODELS` over three models with `search`, `fetch` and an `efforts` array plus
  `effortsFor`, `isEffortFor` and `DEFAULT_EFFORT`, because Coffee has an effort dial. Health's
  exports `MODELS` over two with `search` and `fetch` and a `COMPARISON_MODEL`. The Cookbook's has
  **no `search` at all**, deliberately, because nothing in it searches — it fetches the one page you
  pasted. Diffed at the gate rather than assumed: no two alike.
  **`packages/shared` is for files that must be byte-identical, and these must not be.**
  `scripts/stamp-shared.mjs` writes copies outward and `drift` *fails* a copy that disagrees, so
  putting this file there forces one of two bad outcomes: the stamp overwrites each app's deliberate
  differences and every app carries capabilities it decided against, or `drift` goes permanently red
  and the pressure lands on weakening the check — which `CLAUDE.md` forbids outright. What actually
  recurs here is a **pattern** (a registry keyed by model id carrying each model's request shape),
  not a file, and duplicate-and-flag is where a pattern belongs.
  **So there is no Linear issue for it**, and that is the decision rather than an omission: an issue
  would carry a question that has been answered. **What is still open is the livery, TEC-12, not
  this.** If a fourth app ever needs the *identical* registry, reopen it then — additive, and on
  evidence.
- **2026-09-22, superseded 2026-09-24 — The deployment layer is Deployment's.** Platform Config's
  Vercel, DNS and CI went to TechPad Gen on 2026-09-19 and to the TD with the merge on 2026-09-22,
  so one seat owned both sides of the gap between merging and deploying; separation of duties was
  rejected then because a fresh TD session re-reads the repo as well as a second seat would. **On
  2026-09-24 Joel moved the whole layer to a new Deployment agent** — the pull request, the gate, the
  merge order, the merge, migrations at gate time and DevOps: "Essentially it's the deployment layer
  we are stripping out of your job." What changed the answer: the TD now starts and briefs every
  agent, so a TD gate would check work it had directed. **One seat still owns both sides of the gap;
  it moved seats.** The Vercel trap list moved with it, verbatim.
- **2026-09-22 — Linear holds open items. GitHub stays the repo.** The plan was a Routine
  regenerating `.claude/OPEN-ITEMS.md` from Linear so a hook kept printing it; **Joel dropped the file
  instead** ("Let's drop the open items"), so the hook only points at Linear and **every session
  calls Linear to read its items**. That is a convention, not a guarantee — the cost accepted for one
  copy instead of two. `drift` fails if the file returns. Ledger numbers became TEC ids; the old
  numbers in this file were converted on 2026-09-24, and items closed before Linear are named as such.
- **2026-09-22 — No deployment agent.** Proposed and declined. The decisive objection: `CLAUDE.md`
  puts migrations at the gate, so an agent that merges must also apply them — rebuilding the split
  that was deliberately rejected, in the other direction. The second: the gate's value is the
  second-order pass, and **a narrow charter is by construction the agent least able to run it**;
  widen it and the cheap checkout that motivated the seat is gone.
- **2026-09-22 — The sign-off is deleted, not computed.** The spec was **27.9% of `CLAUDE.md`**, and
  a script was the only replacement that recovered the cost. **Joel stopped the debrief outright
  instead**, and then removed the status rule too — no board, no footer, no status spec of any kind.
  `BOARD.html` went with it.
- **2026-09-23 — Health reads recipes through a Cookbook API, authenticated by forwarding the
  session** (TEC-11). Reading `cookbook` tables directly was rejected: a second shared table, and
  Health tied to Cookbook's layout. A secret-based carve-out was unnecessary — the middleware already
  accepts any valid session — and would have been a fourth password gate. Contract: Cookbook's charter.
- **2026-09-23 — Agents do not write Vercel.** When the connector started exposing project-settings
  and env-var writes, Joel: *"follow charter."* Settings and env vars are his dashboard steps, like
  projects, domains and DNS. `CLAUDE.md` said changing an existing project's settings was fine and was
  corrected on 2026-09-24. Since TEC-35 a hook holds every Vercel call that is not a read for Joel's
  click — a backstop for this rule, not a way round it.
- **2026-09-24 — TEC-21: go.** Joel approved snapshotting macros onto Health's entries at log time.
  The Health plan's 2026-09-22 decision stands — a correction does not reach backwards, and an entry
  keeps the item id and version it snapshotted — and the code catches up through TEC-21. Until it
  lands, a correction still reaches past days, which is exactly what the decision exists to stop.
- **2026-09-24 — Coffee's *Search again* keeps only the freshest result**, even when it finds less
  than the guide it replaces. Joel's call; the accepted cost is that a second search can overwrite a
  richer guide with a thinner one.
- **2026-09-24 — The charter cap is 350, and `CLAUDE.md` is the authority.** #163 wrote ≤350 into
  `CLAUDE.md` and 370 into `drift` on the same day — 370 was a ratchet at Coffee's size. `drift` now
  enforces 350, and Coffee's charter came under it by cutting only stale and computable content.
- **2026-09-24 — The Cookbook is a site, tabs and all.** Settled *site* at standup on 2026-09-20;
  Joel asked for tabs on 2026-09-22. The technical director's ruling: its tabs — Recipes · King
  Soopers list — are the verb index, the thin index a site has, and each is one long page. So it
  stays a site, and `SURFACE.md` now says a tab bar can be that index.
- **2026-09-24 — Two rules that could not be followed, redrafted.** (1) A TD pull request that
  changes another agent's charter cannot also update that agent's handoff, because nobody else may
  write it; the gate no longer asks it to, and the TD files a Linear issue asking the agent to
  reconcile. #194 is the case: it staled Health's and Cookbook's handoffs minutes after both were
  written. (2) A handoff never calls its own branch or pull request in flight — the gate merges after
  its author has gone, so the line is false from the merge on and nobody else may fix it.
- **2026-09-24 — Login guessing is limited at Vercel's firewall, not in code** (TEC-7). Joel chose a
  shared lockout table on 2026-09-19 and replaced it with a per-IP rate limit on `POST /api/login` in
  every project: no code, no database credential for the hub, and no counter a stranger could fill to
  lock Joel out of every app. The accepted cost: each project counts separately, and many addresses
  get many guesses — the password stays the real control.
- **2026-09-24 — Where things live.** GitHub holds code and rules. Linear holds all open work, the
  parking lot (the `Parked` label) and a tool's design reasoning, as documents; the Health plan moved
  there from `.claude/HEALTH-PLAN.md`. The Garage holds computed facts. **A handoff holds state and
  traps, never a to-do**: a to-do in a handoff is visible only to its author's next session, and
  every one found in the 2026-09-24 review had a better home as an issue.
- **2026-09-24 — The hooks became one guard that fails closed** (TEC-35, on Joel's authorisation). It
  parses a command instead of grepping it, because the grep both missed real pushes to main and
  refused harmless commands — and a hook that fires on the wrong thing teaches agents to route around
  hooks. Joel's Vercel and Supabase calls *ask* rather than refuse: they are Joel's, not forbidden.
  Linear writes that break the issue rules are *refused*, never asked: Joel should not be clicking
  through formatting.
- **2026-09-24 — Every agent runs as the TD's helper, from a preset, and none opens its own pull
  request.** Joel: "Subagents is the way to go", "You don't spin up agents without checking in",
  "no one creates their own PRs". Helpers over separate sessions because a preset pins the model and
  the effort and a separate session cannot set effort; the accepted cost is that an agent reaches
  Joel only through the TD. **Opus 5.5 at medium for every agent**: Joel first said Opus 5.5 at high,
  then asked whether Opus 5 would do for agents working from a brief. Opus 5.5 is the newer model and
  the cheaper per token, so effort was the lever, not the model. **Opening a pull request is not
  held by the hook** ("they will be spun up with intention, so there's no need for a check").
  *Superseded 2026-09-25: merging is not held either — Joel wants "only one gate", his go before the
  TD starts Deployment, not a click per merge. Auto-merge, reviews and API commits still ask.* **Every agent edits Linear without asking Joel.** **"Close out" now also means
  the session is ready to archive**: nothing left only in the conversation — every open item is a
  commit or a Linear issue.

## Mistakes — do not repeat

- **Merging a second change on a gate result taken before the first.** #69 and #70 were merged past
  an open #68 that had been opened while the TD worked, and #70's body asserted "#69 was the only
  thing open" — nobody had looked. The branch list had been verified clean twenty minutes earlier and
  the TD reasoned from that memory. **A branch list is not a fact you check once a session. Check the
  open list with a live call as the first step of every merge.** It cost nothing that time, which was
  luck: #68 touched 47 files across every app and shared none of them.
- **Merging something that contradicts a settled decision because it is green.** PR #27 passed every
  first-order check and contradicted three settled decisions; it was merged and ratified afterwards.
  **Code already written applies pressure to approve it, so `CLAUDE.md` ends up following the code.**
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
- **A green `build (app)` does not mean that app was built.** Each job compares its build scope —
  read from its `vercel.json` by `scripts/build-scope.mjs` — against its base and exits early, still
  reporting success, deliberately: a job skipped by a `paths:` filter never reports at all and the
  required check would never be satisfied. Read the job, not the tick. A skip says so in a step
  called `Nothing to do`.
- **The hosted Supabase API stamps its own migration version and ignores the filename.** That is how
  the repo and database came to disagree on four versions, and then three more (TEC-13). The practice
  is in `supabase/README.md`; read the history back after applying. Local and remote must differ by
  exactly one — the withheld contacts seed. A second difference is real drift.
- **`supabase db push` cannot work here, permanently.** It refuses whenever the remote holds a
  version the local directory lacks, and `20260908235234` is remote-only for ever on purpose. The TD
  applies migrations through the hosted API at gate time.
- **"Invalid API key" in the Cookbook is Supabase, not Anthropic.** Reading the book or the shopping
  list calls no model at all — the only model calls are drafting a recipe and Tidy. Reaching for the
  Anthropic key when the book will not load cost a wrong turn once.
- **A failed read must never render as an empty collection.** "Nothing here" and "we could not look"
  are opposite facts that draw the identical screen, and the empty one is the confident lie. It
  happened in `apps/coffee` on more than one read path, the brew-guide search among them. The
  Cookbook's pattern: `LookupError` becomes a 503 and the client leaves its state `null` rather than
  `[]`, so an unread book cannot be mistaken for an empty one. Anything that lists rows wants this;
  if you are adding a read path, check it first.
- **A new Postgres schema inherits no grants, and exposing it is a dashboard setting.** Three steps,
  not two: the schema, its grants, and the hosted project's Exposed schemas list. Step three lives
  nowhere in this repo and fails looking exactly like a credentials problem — it cost an hour once.
- **Vercel bakes environment variables in at build time.** A dashboard change reaches nothing until
  that project redeploys. This has caught this project out more than any other single fact.
- **A Vercel project's git link is stored on the project, not derived from the GitHub App
  installation.** A six-hour outage came from this: the installation was fixed and deploys still did
  not fire because every project recorded the old org. **If deployments stop, read `link.org` on
  the project before touching anything on GitHub.**
- **`SESSION_SECRET` mismatch does not throw.** It silently rejects valid sessions on every other
  app, and the symptom looks like a login bug rather than a config bug. Nothing verifies parity.
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
  may not. One password rolls out once per project; one signing key cannot.
- **2026-09-18 — Vercel aliases whichever build finishes last, not whichever commit is newest.**
  Three merges four minutes apart left `techpaddock.io` on the Coffee-icon build rather than the hub
  change that merged after it; the fix was to promote the correct deployment. Every merge rebuilt
  every app then. *Since 2026-09-19 each `ignoreCommand` skips a merge outside its app's scope, which
  narrows the race to merges touching the same app — and the hub, which builds every production
  merge (TEC-10), is always exposed to it.* Closed pre-Linear ledger item 9.
- **2026-09-19 — Vercel project state was read wrong twice and both readings reached the repo as
  fact. Read DEPLOYMENT STATE, never a project field.** `BLOCKED` on every commit is paused;
  `READY` at `target: production` is live; `CANCELED` at `target: null` is `ignoreCommand` skipping a
  preview. `live: false` does not mean paused — `tp-home` reads it while serving `techpaddock.io` —
  yet TEC-14 once rested on "unreachable while paused". `framework: null` does not mean a broken Root
  Directory — `tp-health` read null, skipped previews from its own `vercel.json`, built `READY`, and
  served a `verified` `health.techpaddock.io` while being called unreachable for a day on that field.
- **2026-09-20 — Vercel's Redeploy button is a no-op for every app with a diff in its
  `ignoreCommand`.** The Ignored Build Step is a pure function of `HEAD^..HEAD`, so re-running it on
  the same commit returns the same answer every time, and an empty commit produces the same empty
  diff. **That makes an environment variable impossible to pick up from the dashboard** — a
  deployment's env snapshot is taken when it is *created*, so editing a variable changes nothing
  until a new build exists. It cost the Cookbook its bring-up: three redeploys carrying
  `ANTHROPIC_API_KEY` were cancelled in turn while the old build served, correct and live.
  **The fix, landed the same day: every such `ignoreCommand` reads `FORCE_BUILD`.** Set it to
  anything on the Vercel project, redeploy, remove it. It sits **after the preview check and before
  the diff**, so it forces production only and previews stay ruled out — a separate settled call it
  must not quietly undo. The warn band it cost `drift` is reasoned in `drift-check.mjs`. **From git
  the way out is still a commit touching that app's folder or `packages`**, and `packages` rebuilds
  every app at once, which is why it rides in every pathspec.
- **Agents cannot delete a remote branch here, and the refusal is disguised.** **`git push origin
  --delete` hangs up mid-sideband** — `send-pack: unexpected disconnect`, which reads like a network
  blip and invites a retry. **`DELETE /git/refs/heads/...` returns 403, "Write access to this GitHub
  API path is not permitted through this proxy."** Four attempts each, on 2026-09-20. **Pushes that
  create or update a ref work fine**, which is what makes the deletion case surprising. Neither is
  transient: stop after the first. So the gate's merged branch goes by GitHub's *Automatically delete
  head branches* setting (recommended) or by Joel's hand.
- **The TD's handoff-freshness check was structurally dead** — dated against the **frozen**
  `apps/editor`, it read `ok` forever while the handoff was two merges stale. *Fixed 2026-09-23*: it
  now also dates against `scripts` and `.github`. **An inert folder is not an owned one.**
- **A parser of prose must exit non-zero on an unparseable entry.** The ledger's did not: a wrapped
  title dropped an item with no error. The file is gone; the rule holds for whatever reads a
  document next.

## Known, deliberately not fixed

- **Vercel's *Skip deployments when there are no changes* toggle does not behave as its label
  suggests here.** `tp-coffee-app` had it enabled and rebuilt twice from a `.claude/`-only commit.
  Do not plan around it; the `ignoreCommand` in each app's `vercel.json` is what actually scopes a
  build, and every app carries one.
- **`/api/health` sits behind the password gate**, so no external monitor can reach it.
- **`editor.model_status` has zero rows.** The login-time drift check has never once successfully
  written — the oldest unexplained thing in the project. **The likely explanation:** it runs only on a
  login to the editor itself, the shared cookie means Joel logs in on the hub instead, and its
  failures are swallowed. Unconfirmed; the editor is frozen, so it stays unfixed.
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
- **Health's schema was wired on 2026-09-18 without its exposure proved**, and closed on Joel's word
  rather than evidence. *Proved exposed on 2026-09-24* (`supabase/README.md`); kept here so the
  practice — close on evidence — is findable.
- **Parked apps are paused on purpose; their `BLOCKED` deployments are not a bug.**
  `tp-message-editor` since 2026-09-19, because Joel is not using the Message Editor and does not want
  to spend attention on it; `tp-tracker` once he pauses it after 2026-09-24. Every production
  deployment of a paused project reads `BLOCKED`, on every commit, so its subdomain serves whatever was
  live before the pause. **Do not investigate it and do not unpause it to make a check go green.**
  Both apps still build in CI — the matrix comes from the folders on disk — and both are out of the
  hub's roster. **The editor was resumed once, on 2026-09-24**, so the login hardening could reach it;
  Joel re-pauses it after that deploy, and it stays frozen. **Paused is reversible and deleted is
  not.**
