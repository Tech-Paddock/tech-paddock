# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

**Last reviewed: 2026-09-16 00:20 UTC.**

Detail lives in the agent handoffs — `.claude/agents/<agent>/HANDOFF.md`. This file is the index
and the things that belong to nobody else.

---

## Blocking everything else

Nothing. The deploy outage is closed — see the first entry under "Done" below.

## Waiting on Joel

**Titles here are now rendered on the Pit Wall**, so each one leads with a short bold phrase and puts
the reasoning underneath. The generator takes the first bold run as the row title.

1. **Send the GitHub Support request.** The history scrub removed the seven real names from every
   clone, every branch and every commit on `main` — but nine objects stay reachable through
   `refs/pull/*`, and the removed lines still render in the **Files changed** tab of #17 and #21.
   GitHub owns those refs: no API, no force push and no branch deletion touches them, so this cannot
   be done from here. Joel sends one ticket at `support.github.com` asking for garbage collection and
   removal of cached views; the draft is in the 2026-09-15 conversation. **Nothing is more exposed
   than it was an hour ago** — the repo is private with zero forks — this closes it rather than
   accepting it.
2. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, this repo, read-only:
   Contents, Metadata, Pull requests, Actions. `VERCEL_TOKEN` read-only, `tech-paddock` team.
   **The redeploy is not optional** — Vercel bakes the environment in at build time, so a dashboard
   change does not reach a running deployment. Until both are set the Pit Wall runs on repo rows and
   names the two missing sources under "not reported", which is the designed degraded state rather
   than a failure.
3. **Re-upload the active resume template.** #67 teaches the extractor to read colour out of a
   `.docx`, but `/api/reformat` renders from the spec stored on the template row rather than from the
   stored file, so the colours cannot appear until a fresh upload re-extracts them. **Skipping it
   breaks nothing** — `normalizeSpec` fills the missing fields and existing templates render exactly
   as they do today; the change is simply invisible. This is the third re-upload in a week and you
   have approved the fix that ends them, which is now the Resume Formatter's next change.
4. **Confirm Coffee's iOS install works on a real iPhone.** Carried out of a worklog before it was
   deleted, because it is the one thing in the fifteen that was genuinely unfinished rather than
   answered elsewhere. The apple-touch-icon, the web-app meta tags and the safe-area insets were
   verified against the built HTML; **whether iOS actually takes the icon needs a deploy and a
   phone**, which is you. Open it in Safari, add to home screen, and see whether the icon is right.
5. **Decide who moves colours out of `tailwind.config.ts`.** Joel narrowed theme ownership to
   colours and aesthetic decisions, **not config** — and that line cannot be drawn today, because the
   four tools' colours live inside `tailwind.config.ts`. Making it real means moving the values to
   CSS custom properties with Tailwind referencing `var(--token)`, after which colour values are
   TechPad Gen's and the wiring stays the app agent's. **That refactor is itself a config change in
   four apps, so it cannot be TechPad Gen's first act under the rule** — it is the TD's, or theirs
   with explicit authorisation.

## Parked

Deliberately deferred. Not waiting on anyone, not forgotten, and not to be picked up as background
work. Something here moves only when Joel says so.

- **`CRON_SECRET` and the Microsoft Graph integration.** Parked at Joel's request, 2026-09-15.
  **What it is:** `tracker`'s daily sweep at `/api/cron/stale-tasks` reads the dashboard's decay
  list, finds threads gone quiet with no follow-up task open, and creates a Microsoft To Do task for
  each through Graph.
  **Why parking is the safe state:** a scheduled job cannot log in, so `middleware.ts` waves
  `/api/cron/*` past the password gate, and the route's own guard reads `if (secret && …)` — an unset
  `CRON_SECRET` skips the check entirely and the endpoint is public. It is harmless *only* because
  the next line returns early while Graph is unconfigured.
  **Un-parking is the dangerous moment, and the order is not optional.** Set `CRON_SECRET`, redeploy
  so it is actually live, and only then set `MS_GRAPH_*`. Setting the Graph credentials first
  publishes an unauthenticated endpoint that writes into Joel's Outlook on demand.

- **The branch-name action prefix.** Drafted at Joel's request on 2026-09-15 and parked by him the
  same hour, before it reached `main`. **The area rule he approved earlier stands:**
  `claude/<area>-<description>`.
  The draft was six non-overlapping actions — `feat`, `fix`, `ci`, `db`, `doc`, `ops` — before the
  area, with the area omitted where no single app owned the change.
  **The part worth keeping if this is ever revived** is the objection to two of the three examples
  that prompted it. `ci` is a kind of change and works. `pr` and `mrg` are *states*, and a state
  cannot live in a branch name: the name is fixed for the life of the branch while the state moves
  several times a day, so `mrg-…` is accurate for about an hour and misleading afterwards, and nobody
  renames a branch to keep a label honest. What it decays into is noise shaped like information.
  Where a change has got to is already carried by two things that update themselves — the pull
  request's own state, and this ledger.

## Done since this ledger was last written

- **2026-09-16 — All fifteen orphaned worklogs deleted, on Joel's instruction.** Every branch is
  merged and deleted except this one, so every worklog named a branch that no longer existed, which
  is exactly what the README says to clear: `read-all.sh` is meant to show what is claimed *right
  now*. The TD's six went first; Joel then said delete the rest, overriding the TD's judgement that
  another agent's worklog was not the TD's to clear. **`.claude/worklogs/` is now `README.md`,
  `_open-items.md` and `read-all.sh` and nothing else** — the clean baseline the convention assumes.
  **Checked before deleting rather than after.** Three carried a *Need from TD*. Two were already
  answered by `CLAUDE.md` as it now stands — the model exception, closed by *Model choice is per
  task*, and project-wide installability, closed by the Safari paragraph that says not to add a
  manifest on the strength of that rule. The third, TechPad Gen's theme-ownership ask, was closed by
  #66. One genuinely unfinished item survived and is now item 4 above.

- **2026-09-15 — #67 merged: the reformatter reproduces the template's own colours.** The Resume
  Formatter's work; the gate only checked it. Confirmed it does not touch the theme rule that landed
  an hour earlier despite the branch name — no `globals.css`, no `tailwind.config.ts`, no
  `layout.tsx`, no new hex; every colour comes out of the user's `.docx` at extraction time.
  `tp-resume` rebuilt to production on `76971bf` and is READY. **The re-upload it needs is item 3
  above.**
  **Worth keeping from the gate:** they brought `main` in and updated their handoff while the TD was
  preparing to do it for them, so the local merge was discarded rather than force-pushed over live
  work. Force-pushing in that situation is what caused the resurrected-branch incident earlier the
  same night.
  **Also recorded here because only the TD heard it:** Joel approved the re-extract fix — resolving
  the spec from the stored `.docx` at render time instead of the `spec` column. It is written into
  `.claude/agents/resume/HANDOFF.md` as that area's next step, not started by the TD, because
  `apps/resume` is theirs and the `apps/home` override was a single bypass.

- **2026-09-15 — Five merged in one ordered run: #62 to #66.** TechPad Gen's livery record first,
  because it was finished and *Require branches to be up to date* means whichever merges second pays
  the re-take — the cost belongs on the branch still in hand. Then the ratification, the Pit Wall
  spec, the Pit Wall itself, and **the theme-ownership rule last, deliberately**: it is a rule
  change, and landing it before #65 would have failed finished work against a rule that did not exist
  when it was written. Verified first that no two of the five branches touched the same file.

- **2026-09-15 — The Pit Wall is live, and this file is now part of its UI.** `/` is Pit Wall, `/admin`
  is The Garage — labels only, no folder rename. The board reads this ledger's **Waiting on Joel**
  section at build time and renders each entry as a row.
  **That changes how this file should be written, which is why the section above now leads with short
  bold titles.** The generator takes the first bold run as the row title and the rest as detail, so a
  title that runs three lines becomes a three-line heading on the homepage. Keep them short.
  It also means **a stale ledger is now visible rather than merely wrong.** The first build surfaced
  three items here that had been closed hours earlier, which is how this correction came to be made.

- **2026-09-15 — Three "Waiting on Joel" items closed and removed.** The resurrected branch is
  deleted, `claude/brief-migration-and-branch-conventions` merged, and the history rewrite is done and
  verified across 122 commits. **A formatting error of mine is also fixed here**: an earlier edit
  inserted a Parked entry above that section's own introduction, leaving the explanation of what
  Parked means stranded below the first item.

- **2026-09-15 — Ratified: `resume.templates` is no longer append-only.** Joel approved the
  behaviour on 09-14 and the Resume Formatter amended its own charter in #56. **Merging that pull
  request was the ratification** — but three places on `main` went on saying "the TD has not ratified
  this amendment", which was true when written and false the moment it merged. Struck in the charter
  and the handoff.
  **Left alone deliberately:** the same claim in
  `.claude/worklogs/claude-doc-resume-handoff-migration.md`. A worklog is a record of what was true
  when it was written, not a live document, so correcting one retroactively would make it a worse
  record rather than a better one. It is also the Resume Formatter's, and by their own rule it should
  have died with its branch.
  **The general shape, worth recognising next time:** an approval that lands inside the change it
  approves leaves the change asserting it is unapproved. Nothing is wrong except the sentence, and
  the sentence is the part people read.

- **2026-09-15 — The git history was rewritten to scrub real names. What it cost, and what it could
  not reach.** Seven real entities — five companies, two people — traced to one seed-contacts line in
  `CLAUDE.md`'s history. **They were live on `main` as well, not merely historical**, in three
  `apps/tracker` files, which two of my earlier reports had called clean. The first audit searched
  emails exhaustively and proper nouns not at all; the second examined history and assumed the
  working tree was settled.
  **Five things worth not rediscovering:**
  1. **`--replace-text` does not touch commit messages.** Six occurrences were hiding there.
     `--replace-message` with the same file is required, or the scrub reports clean and is not.
  2. **Derived values are the trap.** A name in a test has slugs, email domains and lowercase
     variants that are *separate string literals*. `slugify("X")` asserted against a lowercase
     concatenation breaks if only the input is replaced. One was still missed —
     `recruiter@attain.example`, lowercase, where the map held only the capitalised company — and the
     suite caught it. **An eyeballed scrub would have shipped it.**
  3. **Nine blobs are permanently out of reach**, in GitHub's `refs/pull/*`. GitHub owns those refs.
     A clone is clean; a determined look at old pull-request refs is not. Only GitHub Support can
     clear them, and **the scrub must never be described as a complete erasure.**
  4. **The repo and the database disagreed on four migration versions**, because the hosted API
     stamps its own. Fixed by renaming files, not by repairing the database: the database records
     what ran, the repo records what was intended, and when they disagree about history the repo
     moves.
  5. **A stale clone can silently undo all of it.** Every checkout predating the rewrite reports
     dozens of "unpushed" commits and a stop-hook will tell an agent to push them. **Pushing restores
     the real names.** Mine did exactly this within minutes; TechPad Gen hit it too and correctly
     reset rather than pushed. Any session open across a rewrite must re-clone, never pull.
  **Mechanics, because two guards blocked the last step and neither was wrong.** The repo hook
  refuses `git push … main` — correct, and its regex also catches any compound command merely *ending*
  with the word `main`. The harness classifier separately refused the force-push. Joel finished it
  through the GitHub UI: default branch moved to a rewritten branch, `main` recreated from it. He
  renamed `main` to `main-dep` rather than deleting it, which left **every scrubbed name live on that
  branch** until it was deleted — the safer-looking choice was briefly the more exposed one.

- **2026-09-15 — #56 merged at `1a40550`, migration applied first.** `20260914221259` went in at the
  gate before the merge, which is the new shape rule's first real use: additive, so the running code
  could not see it, so applying first was safe. Verified from a fresh query rather than from the
  write — `archived_at` present, constraint present, three templates intact, one active.
  **And it settled the open question about versions.** Recorded under `20260914221259`, the file's
  own, by inserting the migration row in the same transaction as the DDL. So the preferred mechanism
  in `supabase/README.md` is now proven rather than proposed, and no file has to be renamed after the
  fact. That is the drift closed at its source.

- **2026-09-15 — The Resume Formatter's handoff rewrite is preserved, not retyped:
  `claude/resume-handoff-migration-section`, off current `main`.** Their commit `025b41e`
  cherry-picked verbatim — same message, same bytes, 2 files and 55 insertions, identical to the
  content diff I measured. **I did not edit a word of it**, which matters: the rule is that the TD
  does not write another agent's handoff, and transplanting a commit onto a correct base is a git
  operation rather than an authoring one. The section stays theirs.
  It is a real improvement, which is why it was worth saving rather than dropping: it turns the stale
  "blocked" section into the durable thing — *why the CLI can never push here, and what to do
  instead* — and names the two wrong turns that look reasonable at 11pm.

- **2026-09-15 — The resurrection was at least half mine, and the ledger should say so.** The agent
  took the blame for pushing without re-checking the pull request state. Fair, but incomplete.
  **I pushed a banner onto their branch saying "rewriting it is yours", and then merged the branch
  out from under them three minutes later.** That is an instruction to start work and a removal of
  the place to do it, in that order. The agent had no way to see the merge — no agent can see a pull
  request change state.
  **The lesson is for the TD, not for them: do not leave a to-do on a branch you are about to
  merge.** Either the note points at a fresh branch, or the merge waits. A banner that says "yours to
  finish" on a branch with minutes to live is a trap, however accurate its contents.

- **2026-09-15 — Branch protection required checks are correct for the first time.** All six, all
  GitHub Actions: `build (editor)`, `build (home)`, `build (resume)`, `build (tracker)`,
  `build (coffee)`, `requested-by-joel`. Joel did it and sent the screenshot.
  **`Vercel – tp-coffee-app` is off the list**, which matters more than the two additions. It was a
  *deployment* status required for one app out of five, and leaving it there while turning on an
  Ignored Build Step would have produced a required check that stops reporting — permanently
  unmergeable pull requests, arriving through the Vercel side while the CI change was busy
  preventing exactly that on the GitHub side.
  **Also now visible: *Require branches to be up to date before merging* is on.** That is why merge
  order has teeth from here: after any merge, every other open pull request has to take `main` again
  and re-run before it can go in.

- **2026-09-15 — The Vercel Ignored Build Step is set on `tp-coffee-app`, and it works. Proven, not
  assumed.** Joel set it through Claude in Chrome. `get_project` does not return the command, so it
  was tested instead: commit `e88c814` touches nothing but `.claude/`, and across the five projects
  on that one commit —
  **`tp-coffee-app` CANCELED with no runtime stats, meaning it never built. `tp-home`, `tp-tracker`,
  `tp-resume` and `tp-message-editor` all READY and built.** One commit, four controls, one
  treatment. There is no reading of that except the rule firing correctly.
  **Correction, 2026-09-15 — I got the consequence wrong and said it confidently.** I reported that
  a skipped build posts no passing status and that requiring `Vercel – tp-coffee-app` was "one merge
  away from blocking every Coffee pull request permanently." **That is false.** #56's own checks show
  it: `Vercel – tp-coffee-app` reported **`state: success`, description "Canceled by Ignored Build
  Step."** Vercel marks the *deployment* CANCELED and reports *success* to GitHub. A required Vercel
  check would have been satisfied and nothing would have blocked.
  Removing it was still the right call, for the reason that survives: a deployment status is not a
  test, and requiring one for a single app out of five was arbitrary and undocumented. But that is a
  tidiness argument, not the near-miss I described. **I inferred the mechanism instead of reading it,
  while writing a warning about a check that never reports — the exact failure mode the warning was
  about.**
  **The other four still rebuild on everything.** That is the remaining saving, and it is one paste
  per project whenever Joel wants it.

- **2026-09-14 — Migration versions reconciled by renaming four files, not by repairing the
  database.** The `coffee` migrations were applied through the hosted API, which stamps its own
  version and ignores the filename, so the repo and the database disagreed on four version numbers
  since 2026-09-11. **The files were renamed to the versions that actually ran.**
  The direction is the decision. The database is the record of what ran and when; the repo is the
  record of what was intended. When they disagree about *history*, history wins and the cheap side
  moves. Editing `supabase_migrations.schema_migrations` to match a document written afterwards is
  rewriting the past to agree with the present.
  **Consequence worth carrying: `supabase migration repair` was never needed.** I had put it to Joel
  as a rule that was written for a different case and arguably did not apply here — and it turned out
  not to be in the way at all. The lesson is not about migrations. A ban that looks like it needs
  arguing around is worth one more look for the option that does not touch it.
  SQL verified identical statement by statement before renaming. Local and remote now differ by
  exactly one version, `20260908235234`, which is the withheld contacts seed and is permanent.
  `supabase db push` is safe again — it read those four as unapplied and would have errored on
  `add column`.

- **2026-09-14 — Three conventions into the brief, all Joel's.** The **migration shape rule**
  (additive rides with its code; destructive splits into two pull requests, stop-using then drop; the
  TD applies at gate time before merging; the Deployment section states which shape it is).
  **Branch naming** — `claude/<area>-<description>`, prefix kept, anything after the description
  explicitly declared noise. And the **domain map** finally reads `live` for Coffee.
  The shape rule carries its own incident: `20260912213501` dropped four columns alongside the code
  that stopped using them, which had no safe application moment and went out only because the live
  table was queried by hand first.

- **2026-09-14 — `SESSION_SECRET` parity confirmed good by Joel.** Open since 09-12 across two
  rotations. Closed, and the reason it took two attempts stays on record: the values cannot be read
  back out of the dashboard, and a dashboard change does not reach a running deployment until it
  rebuilds.

- **2026-09-14 — GitHub Actions stops rebuilding all five apps on every push: #57.** Joel: "lets only
  push the apps we are updating if possible." Each matrix job now compares its own folder against the
  merge base with `main` and exits early when nothing under `apps/<app>`, `.github/workflows` or
  `supabase` changed.
  **The implementation is deliberately not the obvious one, and the reason matters more than the
  change.** A workflow-level `paths:` filter skips jobs, and a skipped job never reports a status —
  so a required check is never satisfied and the pull request can never merge. That is the same shape
  as the `Promotion / approval-recorded` name nearly added to branch protection, where a required
  check matching nothing would have blocked every merge in the repo. Every job therefore still runs
  and still reports; the early exit is inside it.
  **The consequence to carry: a green `build (app)` no longer means that app was built.** Read the
  log, where a skipped job says `Nothing to do`. Pushes to `main` still build everything.
  Scope is complete only while there is no root `package.json` and no `packages/shared`. **Adding a
  shared package means adding it to that list in the same pull request**, or an app silently stops
  being built when its own dependency changes.
  The skip path has not executed in CI yet — every commit on the branch touched `.github/workflows`,
  which is in scope for all five. It was simulated against #48, #43, #47 and #53 and matched each
  time. A wrong step turns a job red rather than green, so the untested case fails loudly.

- **2026-09-14 — Merge order: #57 before #56, and why it did not matter much.** Two changes were
  mergeable. **#56 (Resume: template archive, delete, download plus three renderer bugs) was not
  gated and was not merged** — Joel asked for #57 only, and a pull request is merged because he asks.
  The check ran anyway, because order is a decision even when it looks free: #57 touches
  `.github/workflows/ci.yml` and nothing else; #56 touches `apps/resume`, `supabase` and its own
  charter. No shared file, so no conflict in either direction. #57 cannot turn #56 red — CI re-runs
  on push and on pull-request *open*, so a merged workflow change does not re-evaluate an open pull
  request, and #56's `requested-by-joel` result is already recorded. Nothing in #56's body is
  invalidated either: it states that every Vercel project still rebuilds, which #57 does not change.
  **When #56 is gated, its migration is the thing to get right** — `archived_at` must exist before
  its code is live or the Templates tab returns 500.

- **2026-09-12 — Coffee's brew log is merged and live: #51, #52, #53, in that order.** Joel asked for
  the Coffee app to be merged. The order was forced — they were a stack, each based on the one before.
  A bag is now a purchase plus what the roaster published; every variable thing is a brew, so dialling
  in is a sequence you can compare rather than one value overwritten. `coffee.brews` carries the
  dial-in and the measurements, with `extraction_yield` **generated** rather than stored as an input,
  so it cannot drift from the numbers it describes.
  **The migration dropped four columns, and the claim that it was safe was verified before merging
  rather than taken on the note.** Three bags, one `my_method` of `'other'`, every other dial-in column
  entirely null — so the loss is one meaningless value. Also confirmed no code anywhere still
  references them. Applied **as the merge landed**, per the agent's own deployment note: earlier would
  have left the deployed app unable to save a scan, because the running code still read those columns.
  Verified after applying: 3 bags intact, `coffee.brews` present with **RLS on and zero policies**,
  `purchased_date` added, no dropped column remaining, `extraction_yield` reported as `ALWAYS`
  generated. Then the arithmetic itself, which no unit test can reach — a test row with dose 15g,
  beverage 250g, TDS 1.35% computed 22.50, matching `250 × 1.35 ÷ 15`. `tp-coffee-app` is green in
  production on `872f3aa`.
  **One mistake caught by checking rather than assuming:** the test row was inserted and deleted in a
  single statement, and the delete could not see the insert in its own snapshot, so it survived while
  the same query reported zero. A fresh query found it and it was removed properly. Counts read inside
  the statement that wrote them prove nothing.
- **2026-09-12 — New lesson, now in the brief and the charter: a squash merge conflicts the rest of
  its own stack.** Squashing #51 rewrote it as a commit git could not match to what #52 was built on,
  so #52 conflicted, then #53 conflicted in three files including two of app code — none of it a real
  disagreement. The test that settles it: compare the base branch's copy of each conflicted file with
  what the stacked branch already inherited. On #53 all three were byte-identical, making the branch
  side lossless as a fact. Where they differ it is a genuine conflict in another agent's logic and is
  not the TD's to resolve.

- **2026-09-12 — Merge order is now a gate check, and it had a live case the hour it was written.**
  Joel's addition. When more than one change is mergeable the order is a decision even if nobody makes
  it, and the default — whichever got gated first — is the one with no reasoning behind it. Four
  failure modes, each with a case this project already produced: a rule change invalidating pull
  requests already open, two branches on one file, a correction others are waiting on, and a merge that
  turns another pull request red.
  **The live case: #43 and the `requested-by-joel` rule.** #43 was opened before that rule existed and
  its body carries no request line, so merging the rule first turns an in-flight pull request red for a
  rule that did not exist when it was written — which reads as the author's mistake. **So #43 merges
  first.** Recorded here rather than only decided, which is the point of the check.

- **2026-09-12 — Agents commit and push. A pull request exists only when Joel asks for one.**
  His call, arrived at over three passes in one evening: first every pull request as a draft, then no
  agent promoting its own, then this — which replaces both. **The checkpoint moved earlier.** Rather
  than a pull request that exists but cannot move, there is no pull request at all until he asks, and
  asking is how he approves. No drafts, no promotion step, nothing to click.
  When he asks, the agent opens it normally and records the request in the body:
  `Requested by Joel on YYYY-MM-DD — "what he said"`. `requested-by-joel` fails a pull request whose
  body lacks that line.
  **Two things had to change with it or the rule would have quietly broken something.**
  `ci.yml` ran on `pull_request` and on pushes to `main` only — every CI run in the session that
  produced this rule was `event=pull_request`, checked — so with no pull request there would have
  been **no build and no tests** until the moment Joel was asked to approve. It now runs on every
  branch push, so a pushed branch is fully tested before he ever sees it. And the two hooks that
  refused non-draft pull requests were removed: they would have blocked the pull request he does ask
  for.
  **Enforcement dropped from four mechanisms to three, and that is the price of the simpler rule.**
  Nothing mechanical can tell an asked-for pull request from an unasked-for one, because every agent
  acts as the same GitHub account. "Do not open one until Joel asks" rests on honesty. It is written
  in the brief as the most important convention there for that reason.
  **#50 closed as superseded** — it implemented the design this replaced. Its branch carries this work
  instead.
- **2026-09-12 — `CLAUDE.md` now says Chrome is the default and Safari is a utility.** Joel asked
  for a browser note, then amended it the same hour once the consequence surfaced: **Chrome is the
  default, on desktop and phone; Safari is a utility browser, used only where Chrome cannot do the
  job.** Safari is still never the explanation for a bug — reports come from Chrome unless stated,
  and the mobile login bug already lost a round to an ITP theory about a browser that was not in the
  loop.
  Written as a diagnosis rule rather than a word ban, because a ban would have caused a bug: on iOS
  every browser is WebKit, Chrome included, so the `<img>` decode fallback in
  `apps/coffee/lib/image.ts` protects the phone Joel actually uses, and an agent told only "we use
  Chrome" would have deleted it as dead code.
  **This also settles #42.** Installing Coffee through Safari is the intended path, not a defect —
  iOS allows no other route to a standalone home-screen app. The rule says so explicitly, and says
  it is *not* grounds for adding a manifest to make apps Chrome-installable, because that means
  editing `middleware.ts` — the password gate, TechPad Gen's call.
  **Two stale references left for their owners.** `.claude/agents/techpad-gen/HANDOFF.md` still
  carries the Safari/ITP theory for the mobile bug — that file is the open conflict in #43 and is
  theirs to rewrite. `apps/coffee/app/globals.css` has a comment reading "In Safari these insets are
  zero", which is true of any browser tab and should say so; Coffee's to fix, cosmetic, not urgent.
- **2026-09-12 — #42 merged: Coffee installs on the iPhone home screen.** `apple-touch-icon` and
  the `apple-mobile-web-app-*` tags, safe-area insets, a favicon. Deliberately iOS-only: a manifest
  is fetched without credentials, so the gate returns the login redirect and the install silently
  never offers itself, and letting it through means editing `middleware.ts` — the password gate, not
  Coffee's to change. The icon is a static import so it serves from `/_next/static`, the one prefix
  the matcher excludes; Next's own `app/apple-icon.png` convention sits behind the gate, where iOS
  falls back to a screenshot of the login page as the icon. Verified at the gate: matcher confirmed,
  `middleware.ts` untouched, both binaries scanned for metadata and clean, all five matrix jobs
  green. **It also carried the handoff rewrite #41 asked for** — the new rule working in the
  direction it was meant to, one pull request after it landed.
- **2026-09-12 — #43 sent back, and the handoff rule is why.** TechPad Gen's hub re-theme and
  `/admin` page: good work on a base that was never brought current. Conflict in its own handoff,
  CI never ran at all (GitHub cannot build a merge ref while a PR conflicts), and both the handoff
  and the body assert production serves `92c1ec1` when `tp-home` has served `f06ff0c` since 03:57.
  Not backfilled by me, deliberately — the conflict is inside the handoff, so fixing it would mean
  writing it. Detail in `.claude/agents/td/HANDOFF.md`.

- **2026-09-12 — Handoffs are now part of the gate, and #40 is why.** Agents update their
  `HANDOFF.md` when they open or change a pull request; the TD reads every handoff a change touches
  before merging, and a stale one sends the change back rather than getting backfilled on the way
  past. #40 moved Coffee's save ahead of its search — the app's central flow — and updated the
  charter and the worklog and no handoff, so the merge published a document that was confidently
  wrong about the one thing it exists to explain. Coffee's handoff now carries a staleness banner
  and its rewrite is the Coffee agent's first task; the TD did not write it, because a handoff
  written by the TD is a second-hand reading of someone else's work.
- **2026-09-12 — #39 and #40 merged.** Bag lookups no longer report success when the database is
  unreachable — a swallowed Supabase `error` made an unreachable database look like a first-time
  coffee, and two of three call sites answered 200 with a confident wrong answer. And the
  brew-guide search is backgrounded, with a selectable model and effort recorded per bag. #40's
  migration was applied to the hosted project immediately before the merge — additive columns, so
  the running code ignored them and there was no window where new code met old schema.

- **2026-09-12 — COFFEE IS FULLY UP.** `GET /api/health` returns `{"ok":true}`: `coffee schema
  reachable`, `bucket coffee-files reachable`, `ANTHROPIC_API_KEY` set. It is deployed at
  `coffee.techpaddock.io`, behind the password gate, on current `main`.
  **Three separate failures, in three different systems, and only one was where it looked.** The
  `SUPABASE_SERVICE_ROLE_KEY` held a non-JWT value — Supabase's value in a Vercel field, diagnosed
  from `Invalid Compact JWS`, which is Storage failing to parse it as a JWT. `ANTHROPIC_API_KEY` was
  simply blank. And the last one was neither: **the `coffee` schema was never added to the hosted
  project's exposed schemas**, so PostgREST refused it with `Invalid schema: coffee` while the grants
  were perfect all along. Fixed in the Supabase dashboard with no code, no migration and no redeploy.
  **`supabase/README.md` was wrong about this and is corrected.** It said adding a schema means two
  migrations plus `config.toml` — but `config.toml` configures only the local stack, and `coffee` was
  already listed there while the hosted project still refused it. Three steps, not two.

- **2026-09-12 — THE DEPLOY OUTAGE IS CLOSED.** Production had not deployed since 17:48 on 09-11.
  All five projects now serve `0c7d882` (#33); `techpaddock.io` returns 200 from that deployment
  with the password gate intact. Six hours and forty minutes.
  **Two causes, and the second is the one the documentation missed.** Vercel's GitHub App
  installation did not survive the repo moving to the `Tech-Paddock` org, and installing it on the
  org did *not* fix it on its own — a push at 00:12 reached GitHub, ran CI, and produced zero
  deployments. **A project's git link is stored on the Vercel project, not derived from the
  installation.** All five still recorded `link.org: "joelb-401"`, and nothing on the GitHub side
  could rewrite that; removing the personal installation changed nothing. Each project had to be
  disconnected and reconnected to `Tech-Paddock/tech-paddock` in Vercel's own Settings → Git.
  What proved the installation itself was sound was an accident: a sixth project created from
  Vercel's import flow deployed current `main` two seconds after it was made. That project has since
  been deleted. Every custom domain survived the five reconnects.
  **If this happens again, check the project's `link.org` before touching anything on GitHub.**

- **2026-09-11 — PR #28 closed and all dead branches deleted.** The queue is empty: zero open pull
  requests, and `main` plus one docs branch is the whole branch list.
- **2026-09-11 — Coffee has `GET /api/health`** (#31). Reachable after login, it names which
  dependency is unhappy — the `coffee` schema, the `coffee-files` bucket, or a missing
  `ANTHROPIC_API_KEY`. It exists because the build succeeds whether or not the five environment
  variables are right, so a green deploy proves nothing about the configuration. The Anthropic check
  is presence and shape only and reports "set", never "working".
- **2026-09-11 — The two orphaned worklogs were deleted**, by Joel, directly on `main`. The rule is
  now written down in `.claude/worklogs/README.md`: a worklog dies with its branch.

## Decisions made, so they are not reopened

- **2026-09-11 — Google Tasks → Microsoft To Do: APPROVED.** One Azure registration serves both
  calendar and tasks; Google would have meant a second OAuth setup for no extra capability.
- **2026-09-11 — The `tp-` prefix on Vercel project names STAYS.** A proposal to rename live
  projects to bare names was declined. The table was corrected instead.
- **2026-09-11 — Supabase + Vercel Config agents MERGED into Platform Config.** The seam between
  them leaked: the database's credentials live in Vercel.
- **2026-09-11 — PR #27's three brief contradictions: RATIFIED.** Tone as a picklist, the Effort
  toggle deliberately not built, the Context input. Settled; recorded in the Message Editor charter.

## Mistakes, recorded so they are not repeated

- **2026-09-15 — A heredoc delimiter reached `main` in a commit message, for the second time.**
  `MSGEOF` sits at the end of #60's squash message. Cosmetic, and staying: removing it means
  rewriting `main` again, with protections restored, for one stray word.
  **The first time this happened it was recorded as a lesson and the lesson did not work**, which is
  the part worth fixing rather than the typo. It failed because it was filed as "be careful with
  heredocs" — and this time the delimiter was not in a heredoc at all. It was pasted into a merge
  tool's `commit_message` parameter, where no shell was involved and the earlier lesson simply did
  not apply.
  **So the rule is about the destination, not the mechanism: read the last line of a commit message
  before submitting it, wherever it is being submitted.** A lesson attached to one mechanism misses
  the next mechanism, which is how a repeat gets recorded as a novelty.

- **2026-09-11 — PR #27 was merged when it should have been held.** It contradicted three settled
  decisions in the brief. Every first-order check passed — clean rebase, worklog opened, `CLAUDE.md`
  untouched, CI green on the head — and it was merged on that basis, with ratification asked for
  afterwards. Joel's correction: reject it and kick it back to the agent to ask him. The outcome was
  approval; the handling was still wrong, because code already written applies pressure to approve
  it and the brief ends up following the code. **Two rules came out of this**, both now in
  `CLAUDE.md`: ask before you build when a change contradicts something settled, and answer the
  second-order questions before a change is agreed.
- **2026-09-11 — The `/api/summary` flag was wrong, and it was the TD's error.** Raised as widening
  `INTERNAL_API_SECRET` across four apps, from reading design notes rather than the route. The
  carve-out is one exact path, mirrors the editor's `/api/draft` precedent, is read-only and fails
  closed. Recorded as mistaken rather than quietly dropped. **Verify from the code.**

## Known, deliberately not fixed

- **2026-09-12 — Every push still rebuilds every Vercel project, including `tp-coffee-app`.**
  **Still true after #57, which fixed the GitHub Actions half only.** The remaining fix is an Ignored
  Build Step — `git diff --quiet HEAD^ HEAD -- . ../../supabase`, set per project in Settings → Git,
  run from each project's Root Directory. **That is a different mechanism from the toggle described
  below, which is the one that failed here**, so its failure is not evidence against the command.
  Untested by any agent; try it on `tp-coffee-app` alone before the other four.
  `tp-coffee-app` has *Skip deployments when there are no changes to the root directory or its
  dependencies* **enabled**, and it still rebuilt twice from #35 — a commit touching only `.claude/`,
  nothing under `apps/coffee`. **So the toggle does not behave as its label suggests, at least not
  here, and a previous version of this entry asserted the opposite. Do not plan around it.** Why it
  did not skip is not understood; the plausible readings are that it does not apply to the first
  build after a Root Directory change, or that "dependencies" is broader than it sounds. Establish
  the behaviour before relying on it either way.
  That leaves the `ignoreCommand` change in the Platform handoff still unlanded and still arguably
  wanted — a docs-only commit currently triggers five full Next.js builds.
- **2026-09-12 — DNS is now uniform, and that entry is retired.** All four subdomains — `editor`,
  `tracker`, `resume`, `coffee` — are CNAMEs to `d1317e1174061c29.vercel-dns-017.com`, changed by Joel
  at 01:39 and verified resolving. The apex `techpaddock.io` stays an A record at `76.76.21.21`
  because an apex cannot be a CNAME; that is correct rather than a leftover. All four app domains
  still return 200 and still send `frame-ancestors 'self' https://techpaddock.io
  https://*.techpaddock.io`, so the embed restriction survived the switch.
- **2026-09-11 — `/api/health` sits behind the password gate**, so no external monitor can reach it.
- **2026-09-11 — `editor.model_status` has zero rows.** The login-time drift check has never
  successfully written. Not diagnosed, and the oldest unexplained thing here.
- **2026-09-11 — The hub's mobile login bug.** Opening a tool from an embedded tile re-triggers that
  app's login on mobile. **Reported on Chrome, which is the only browser used here** — so a
  cookie-partitioning explanation borrowed from another engine is not the diagnosis, and reaching for
  one cost a round already. Check what URL the iframe actually loads first; that is still unchecked.
  `CLAUDE.md` now says this once, under the shared foundation, so it stops being re-litigated.

## Read this before transferring the repo again

**A repo transfer breaks every running agent session, irreversibly for that session**, and it is
what broke deployments today.

- A session's authorized repository set is **fixed when the session starts**. When the repo moved,
  the running TD session lost `git fetch` and every GitHub API call and could not be repaired —
  `add_repo` refuses cross-owner additions.
- **GitHub App installations do not transfer with a repository.** Reconnecting the connector does
  not help: it re-authorizes an identity, it does not create an installation on an org that has
  none.
- **Vercel's app is subject to exactly the same thing**, which is this morning's lesson arriving
  again this evening as a three-hour deployment outage.

Before the next transfer: install Claude's **and** Vercel's GitHub Apps on `Tech-Paddock` first,
with "only select repositories" — the org already holds three unrelated repos. Then stop every
running session. Then move. In that order.

## Enforcement status

Rules in `CLAUDE.md` are written, not enforced. Only three things enforce:

1. **Branch protection** — the GitHub API now reports `main` as `protected: true`, checked
   2026-09-12. That supersedes the previous standing instruction to assume it is inert. No agent can
   read rulesets, so *which* checks are required is still unverifiable from a session — including
   whether `build (coffee)` is among them.
2. **CI** — five matrix jobs. Hardcoded; a sixth app is silently untested until added.
3. **Hooks** — three in `.claude/settings.json`, currently doing the real work. `SessionStart`
   prints this ledger into every session; two `PreToolUse` guards refuse a push to `main` and refuse
   `supabase migration repair`. They work regardless of GitHub plan.
