# claude-kickoff-pxdz0f
agent: technical director · apps: none · shared files: CLAUDE.md
authorized by: Joel, directly, in session — "part of your rules should be to check handoffs before
deploying and agents should update it when finishing creating or updating a pr"

## 2026-09-12 04:00 — claim
Working on: adding handoffs to the merge gate, both halves — the agent's obligation and the TD's
check.
Touching: CLAUDE.md, .claude/agents/td/RULES.md, .claude/agents/coffee/HANDOFF.md,
.claude/worklogs/_open-items.md
Depends on: nothing

## 2026-09-12 04:00 — why this rule has teeth, and where it bit immediately
#40 is the evidence. It moved Coffee's save ahead of its search — the app's central flow — added
five columns to coffee.bags, and made the search model selectable. It updated RULES.md and its own
worklog. It touched no HANDOFF.md at all, and I merged it, so Coffee's handoff now describes an
order the code no longer follows.

That is the failure this project keeps paying for: not a missing document, a confident wrong one.

The rule is deliberately two-sided. Agents write the handoff at pull-request time rather than at
session end, because a session may not get an end. The TD reads every handoff a change touches and
sends back a stale one rather than fixing it in passing — a handoff the TD writes is the TD's
second-hand reading of another agent's work, which is precisely what these files exist to replace.

I applied that to myself here. Coffee's handoff gets a staleness banner naming what changed and
pointing at RULES.md, which is correct; the rewrite is the Coffee agent's. Backfilling it would
have been the comfortable thing and would have made the new rule decorative on the day it landed.

## 2026-09-12 04:00 — handoff
Landed: the rule in CLAUDE.md (both halves), the first-order check in the TD charter, a staleness
banner on Coffee's handoff, and the ledger entry.
Open: Coffee's handoff rewrite, which is that agent's. RULES.md there also still claims the model
toggle needs an exception to a CLAUDE.md pin that #38 removed — stale, flagged, not mine to edit.
Need from TD: nothing. Joel authorized this directly.

---

## 2026-09-12 18:40 — claim: gate the two open pull requests

Branch reset onto `main` after #41 merged rather than stacked on merged history, so this entry sits
under the same name on a fresh base. Nothing here is code; it is the ledger, my own handoff, and this
worklog.

**#42 merged.** Coffee's iOS install. The two claims worth checking were both checkable: the
middleware matcher really is `/((?!_next/static|_next/image).*)`, so a static-imported icon does land
outside the gate, and `middleware.ts` is untouched in the diff. Both new binaries scanned for
metadata — a 180x180 PNG and a 32x32 ico, no text chunks, no author fields. All five matrix jobs
green on `8aaea373`. It also carried the handoff rewrite #41 asked for, which is the first evidence
that rule works in the direction intended.

One imperfection noted and not blocked: `app/favicon.ico` is served from a gated route, so signed out
it answers a redirect rather than an icon. That is still an improvement on the 404 it replaces, and
the load-bearing icon — `apple-touch-icon` — is correctly static.

**#43 sent back.** TechPad Gen's hub re-theme and `/admin`. The change is good and the base is not:
behind `main`, conflicted in its own handoff, CI never ran, and both the handoff and the body assert
production serves `92c1ec1` when `tp-home` has served `f06ff0c` since 03:57 today. I checked that
against the Vercel account rather than against the ledger, because the ledger asserting a deployment
state nobody re-verified is one of the two recorded mistakes here.

The conflict is inside their handoff. Resolving it would mean writing their handoff, which #41
forbids me. So it goes back whole rather than half-fixed — the first live test of that rule, on a
pull request opened an hour after it landed.

**Raised for Joel, not acted on:** a sixth Vercel project called `tuning`, created 18:02 today and
not by me. Checked for exposure first, since a repo-root project serving an unprotected page is an
incident already on the mistakes list — it is behind Vercel SSO with no custom domain, so it is
contained. Creating a project is still never-without-the-TD, so the question of whose it is goes to
Joel. Also his: `CLAUDE.md` says `middleware.ts` is byte-identical in five apps and it is three
distinct versions. The rule holds; the reason printed under it is false.

## 2026-09-12 18:40 — handoff
Landed: #42 on `main`, #43 sent back with reasoning on the pull request, ledger and TD handoff
current, ledger numbering fixed where it skipped 2.
Open: #43 awaiting TechPad Gen. Two questions with Joel — the `tuning` project and the
`middleware.ts` sentence in `CLAUDE.md`.
Need from TD: nothing, this is the TD.

---

## 2026-09-12 19:00 — claim: the browser is Chrome, said once in CLAUDE.md

Joel asked for a general note that the browser is Chrome and that Safari should not be referenced.
Branch reset onto `main` after #44 merged, so this sits on a clean base under the same name.

**Written as a diagnosis rule, not a word ban, and that distinction is the whole substance.** I
grepped the repo first. The nine Safari references are two different things wearing one name:

*Wrong, and what Joel is objecting to* — the Safari/ITP theory for the mobile login bug, in
techpad-gen's handoff and in this ledger. A guess about an engine nobody runs, which survived because
the word made it sound diagnosed.

*Load-bearing* — on iOS **every** browser is WebKit, Chrome included. `apps/coffee/lib/image.ts`
keeps an `<img>` fallback because `createImageBitmap` cannot always decode an iPhone HEIC, and the
primary device is a phone. An agent told only "we use Chrome, drop the Safari references" deletes that
and breaks photograph-a-bag on the exact device the tool exists for. And iOS standalone home-screen
install is a Safari-only mechanism, which #42 depends on.

So the note names those two as platform constraints, requires the constraint be named rather than the
browser, and forbids Safari everywhere else. A blanket ban would have been faithful to the words and
would have caused a bug.

**Not mine to edit:** the Safari/ITP text in techpad-gen's `HANDOFF.md` — that file is the open
conflict in #43 and rewriting it is exactly what #41 forbids me. Flagged on the ledger instead. Same
for a cosmetic Coffee CSS comment.

**Raised for Joel rather than assumed:** #42 shipped iOS home-screen install yesterday, and that
install runs through Safari because Apple allows no other route to a standalone app. If he never opens
Safari, that feature is unreachable as built. Reaching it from Chrome needs a manifest, which needs
`middleware.ts`, which is TechPad Gen's shared-pattern call — not Coffee's.

## 2026-09-12 19:00 — handoff
Landed: the Chrome note in `CLAUDE.md` under the shared foundation, and the ledger's own mobile-bug
entry reworded to stop leading with the wrong engine.
Open: #43 still with TechPad Gen. Three questions with Joel — the `tuning` project, the
`middleware.ts` sentence, and whether Coffee's iOS install is worth keeping if he never opens Safari.
Need from TD: nothing, this is the TD.

---

## 2026-09-12 19:25 — claim: amend the browser note, Safari is a utility

Joel amended it within the hour of #45 landing, once the consequence I flagged surfaced: Chrome is the
**default**, Safari is a **utility browser** used where Chrome cannot do the job. Not a ban.

That is a better rule than the one I wrote, and it resolves the tension I had raised rather than
choosing a side of it. My version forbade Safari everywhere but two named carve-outs, which made
Coffee's install read as a tolerated exception. Under the amendment it reads as the intended path,
which is what it actually is — iOS allows no other route to a standalone home-screen app.

What survives unchanged is the part that was doing the work: **Safari is never the explanation for a
bug.** Reports come from Chrome unless they say otherwise, and the mobile login bug already lost a
round to an ITP theory about a browser that was not in the loop.

One thing I added that Joel did not ask for, and the reason: the rule now says explicitly that it is
**not** grounds for adding a web app manifest to make apps Chrome-installable. Without that line, the
next agent reads "Chrome is the default" and reasonably concludes the install should work from Chrome
— which means editing `middleware.ts`, five copies, TechPad Gen's call, on the strength of a rule that
never asked for it. A rule that quietly authorizes work nobody sanctioned is worse than no rule.

## 2026-09-12 19:25 — handoff
Landed: the amended note in `CLAUDE.md`, ledger entry rewritten rather than appended to so there is
one account of the rule and not two.
Open: #43 still with TechPad Gen. Two questions with Joel — the `tuning` project and the
`middleware.ts` sentence. The iOS install question is closed by this amendment.
Need from TD: nothing, this is the TD.

---

## 2026-09-12 19:45 — claim: correct the middleware.ts claim everywhere it is asserted

Joel delegated this ("update the middleware as you see fit"). Scope decision made here rather than
assumed: he authorised the correction, and the question was how far it reaches.

**Re-verified by checksum first, not taken from TechPad Gen's report.** `lib/auth.ts` and
`lib/password.ts` are identical across all five. `middleware.ts` is three: `home`/`resume`/`coffee`
share one at 47 lines, `editor` is 59 with a scoped `/api/draft` bypass, `tracker` is 65 with
`/api/summary` plus an outright `/api/cron/*` wave-through. Both carve-outs are commented and
deliberate.

**The rule was never wrong. The reason under it was, and that is the dangerous part** — it hid the
real hazard. `middleware.ts` is not risky because the copies must match; it is risky because it *is*
the password gate, so a bad edit publishes an endpoint rather than breaking a login. Tracker already
demonstrates it: `/api/cron/*` skips the gate and the route's own `if (secret && …)` fails open
without `CRON_SECRET`. That trap has been on the ledger for a day while the rule guarding the file
described a different danger entirely.

**Corrected in eleven places** — `CLAUDE.md` twice, the TD charter, and the `RULES.md` and
`KICKOFF.md` of all five app agents. Every prohibition is byte-for-byte unchanged; only the
justification moved. I edited other agents' charters, which is TD-permitted and which I would not do
on my own initiative; the alternative was leaving ten specification files asserting a fact the brief
now contradicts, which is the drift this project keeps paying for.

One of the eleven was mine, written an hour earlier: the Chrome note in `CLAUDE.md` said
`middleware.ts` "is five copies". I repeated the error while flagging it.

`message-editor` and `tracker` were the proof it had gone unread for a long time — each names its own
carve-out and then calls the file byte-identical in the very next sentence.

**Left alone:** `.claude/agents/coffee/HANDOFF.md` still carries the claim. A handoff is not the TD's
to rewrite; Coffee corrects it next time it touches that file. Merged worklogs keep it too, correctly
— they are a record of what was believed at the time, not a specification.

## 2026-09-12 19:45 — handoff
Landed: the corrected reason in the brief, the TD charter and five agent charters plus their
kickoffs; ledger item closed and the two stale ledger references fixed.
Open: #43 still with TechPad Gen. One question with Joel — the `tuning` project, which he has said he
will delete.
Need from TD: nothing, this is the TD.

---

## 2026-09-12 20:00 — claim: close the tuning project item

Joel deleted it. Verified against the Vercel account rather than recorded on his word — five projects
remain, all `tp-` prefixed, and every one still reads `link.org: "Tech-Paddock"`, so the re-linking
that closed this morning's deploy outage is still holding. That second fact is the one worth having
checked; the deletion was never in doubt.

Kept the exposure finding in the Done entry rather than deleting it with the item. The next unexplained
project is the case it is for: check SSO coverage and custom domains first, because the recorded
incident here is a project pointed at the repo root serving an unprotected page. `tuning` was behind
SSO with no custom domain, so it was contained — which is not the same as authorized, and is why it
went to Joel instead of being noted and dropped.

## 2026-09-12 20:00 — handoff
Landed: ledger item closed, Waiting-on-Joel renumbered to four.
Open: #43 with TechPad Gen, and a new Coffee branch `claude/coffee-surface-library-errors` with no PR
yet. Nothing waiting on me.
Need from TD: nothing, this is the TD.

---

## 2026-09-12 20:15 — claim: every pull request opens as a draft

Joel's change. I asked two questions first rather than assuming, because both readings led to
materially different rules: whether it binds the TD as well, and who performs the promotion. Answers:
everyone including me, and the agent says it is ready, Joel approves in chat, then it is promoted.

**The second answer has a consequence he did not have to spell out, and I built it in.** Agents cannot
see each other, and they cannot see Joel's chat. So a pull request that is merely out of draft carries
no evidence of approval — the next TD session cannot tell an approved promotion from an agent that
promoted itself. The rule therefore requires the approval be recorded on the pull request, quoting it.
This follows from something already in the brief: the repo is the only channel. An approval that lives
only in a conversation did not happen.

**Checked before writing, not assumed:** `ci.yml` triggers on bare `pull_request:` with no `types:`
filter and nothing anywhere keys on draft state, so drafts get all five matrix jobs. And GitHub's
merge API refuses a draft outright. That makes this the first rule in `CLAUDE.md` with actual
enforcement behind it rather than an agent's compliance — the file's closing line says the hooks were
the only such part, and that is now one item out of date in the right direction.

**This pull request is a draft**, which is the rule applying to itself on the first opportunity, the
way #41 did. I will not promote it. #43 I converted *to* draft — the safe direction, and not the
promoting-for-someone-else the rule forbids.

## 2026-09-12 20:15 — handoff
Landed (pending approval): the draft rule in `CLAUDE.md` Always and Merging, and as the first
first-order check in the TD charter.
Open: this PR awaiting Joel's promotion. #43 now a draft with TechPad Gen.
Need from TD: nothing, this is the TD.

## 2026-09-12 20:45 — fill the enforcement gap, and let agents promote their own

Joel: "Fill the gap. Write it so that they can promote their own." Those go together — self-promotion
is only safe if the record is checked by something other than an agent's good intentions.

**The gap, precisely.** GitHub refuses to merge a draft, which is real enforcement. Nothing stopped an
agent promoting its own pull request and asserting an approval that never happened. The note I had
already required was convention, in the same class as everything else here.

**The fill is a check, not a prohibition.** `.github/workflows/promotion.yml` reads the pull request on
promotion and fails it if no comment carries
`Approved by Joel on YYYY-MM-DD — "what he said"`. Server-side, so it does not depend on compliance.

Built and tested rather than written and hoped:

- YAML parses; the `on:` key becomes boolean `True`, which is the usual gotcha and is what `ci.yml`
  already does, so it is fine.
- The inline script is valid as `github-script` wraps it — `node --check` rejects it bare because of
  top-level `await`, which is a property of the checker, not the script.
- The regex was run against eight cases: em dash, en dash and hyphen all pass, a note buried
  mid-comment passes, and missing date, missing quote, empty quote and plain prose all fail.
- The four logic paths were dry-run against fake payloads: draft passes, promoted-without-note fails,
  promoted-with-note passes, comment-on-a-plain-issue is ignored.
- `issue_comment` is a trigger so a note posted after promotion heals the check instead of leaving it
  stuck red.

**Its one honest limit, written into the file and the rule rather than buried.** Every agent comments
as the same GitHub account, so authorship proves nothing. The check catches an approval somebody forgot
to get, never one they invented. I did not pretend otherwise, and there is no machinery worth building
for the difference in a single-user project.

**A consequence for Joel's list:** a failing check only blocks a merge if it is required, and branch
protection currently names four of five. So this is a red X the TD reads until he adds it — recorded
alongside `build (coffee)`, which today proved it is protecting nothing when #48's merge was refused
with "4 of 4 required status checks are expected".

**Also corrected the file's closing line**, which claimed the hooks were the only enforcement. That was
true when written and is now wrong in four places rather than one.

## 2026-09-12 20:45 — handoff
Landed (pending approval): self-promotion with a mandatory note, the check that verifies it, the
matching TD gate action of demoting rather than asking, and a corrected enforcement summary.
Open: this PR still a draft awaiting Joel. #43 draft with TechPad Gen.
Need from TD: nothing, this is the TD.

**Correction before it could bite.** I had written the check as `Promotion / approval-recorded` in six
places — the workflow name plus the job name, which is how some CI surfaces label a check. GitHub
reports this one as plain `approval-recorded`, verified against the live run. Left alone, Joel would
have added the wrong name to required checks, and a required check matching nothing is never satisfied:
it would have blocked every merge in the repo until removed. Corrected everywhere, with the exact name
and that warning written into the ledger item asking him to add it.

**What the live run does and does not prove.** It proves the workflow is wired, runs on a draft, and
completes green. It cannot prove the failing path, because this pull request is a draft and the draft
branch is the only one reachable — and the Actions log API refuses this token, so I cannot read which
branch executed. The negative cases are covered by local dry-run only: promoted-without-note fails,
promoted-with-note passes, comment-on-a-plain-issue is ignored. **First real proof comes the first time
someone promotes without a note**, and that is worth confirming when it happens rather than assuming.
I did not promote anything to test it: doing that would be an agent promoting without approval on the
day the rule forbidding it landed.

## 2026-09-12 21:05 — correction: no agent promotes, and the hooks now enforce it

Joel's "so that they can promote their own" was a typo for **can't**. That inverts the design, and the
inverted one is better for a reason worth writing down: if an agent may promote, the technical director
can promote and then merge, which collapses the checkpoint back into the single actor the rule was
written to interrupt. Promotion has to sit with the one participant who is not an agent.

So: **nobody promotes but Joel.** Not the author, not the TD. Demoting back to draft stays allowed,
because it is the safe direction and it is the TD's defined response to a promotion that should not
have happened.

**And this is enforceable, unlike the note.** Two new `PreToolUse` hooks in `.claude/settings.json`
following the existing deny pattern: `create_pull_request` is refused unless `draft: true`, and
`update_pull_request` is refused when it sets `draft: false`. Hooks are the part of this repo that does
not depend on an agent choosing to comply, which is exactly the property this rule needed and the note
can never have.

**A real bug in my first version, found by testing rather than by reading.** I wrote
`jq -r ".tool_input.draft // \"absent\""`. jq's `//` is a null-**or-false** default, so `false` yields
`"absent"` — and the promotion case, the single case the hook exists to block, fell straight through as
allowed. Proven directly:

    $ echo '{"tool_input":{"draft":false}}' | jq -r '.tool_input.draft // "absent"'
    absent

Replaced with `if has("draft") then (.draft|tostring) else "absent" end`, which distinguishes false
from absent. All six cases now behave: create with draft true allowed, create with draft absent or
false denied, update to draft false denied, update to draft true allowed, body-only edit allowed.

Worth noting the shape of that mistake, because it is the same one as the read-all.sh bug earlier in
this branch: both were guards that silently permitted the thing they existed to catch, and both looked
correct on the page. A guard that fails open is worse than no guard, because it is also reassuring.

## 2026-09-12 21:05 — handoff
Landed (pending approval): promotion belongs to Joel alone, enforced by two hooks; the approval note
still required and checked; demoting the only draft change an agent may make.
Open: this PR a draft awaiting Joel — and now only he can promote it, which is the rule proving itself.
#43 draft with TechPad Gen.
Need from TD: nothing, this is the TD.

## 2026-09-12 21:40 — supersede the draft design: no pull request until Joel asks

Third pass on the same problem in one evening, and this one is better than my two. Joel: agents commit
and push; a pull request is opened only when he asks; no drafts needed, because asking *is* the
approval. **The checkpoint moved earlier rather than being added later**, which is why it is simpler —
there is nothing to promote and nothing to click.

**Two things had to change with it or the rule would have quietly broken something, and I checked
rather than assumed.** Every CI run in this branch's history was `event=pull_request` — confirmed
against the Actions API — and `ci.yml` only ran on pushes to `main`. So with no pull request there
would have been **no build and no tests at all** until the moment Joel was asked to approve: he would
have been greenlighting code CI had never seen. `ci.yml` now runs on every branch push. And the two
hooks refusing non-draft pull requests had to go, or they would have blocked the pull request he does
ask for — a guard outliving its rule and breaking the successor.

**`approval-recorded` is repointed rather than deleted**, as `requested-by-joel`, reading the pull
request *body* instead of scanning comments. That is strictly simpler: no ordering constraint, no
self-healing comment trigger, nothing to post separately — the line goes in the body at creation.
Seven regex cases checked, JS validated as `github-script` wraps it.

**Enforcement went from four mechanisms to three, and I am not dressing that up.** Nothing mechanical
can distinguish an asked-for pull request from an unasked-for one, because every agent acts as the same
GitHub account. "Do not open one until Joel asks" rests entirely on honesty. I wrote that into the
brief as the most important convention there, rather than leaving the enforcement summary overstating
what holds.

**#50 closed as superseded**, and this branch carries the replacement. That also dissolved the deadlock
it was stuck in: it needed a promotion only Joel could perform, on a rule that no longer exists.

**This change follows its own rule.** The branch is pushed and finished; I am not opening a pull request
for it. Joel asks, or it waits.

## 2026-09-12 21:40 — handoff
Landed on the branch, no pull request opened: commit-and-push as the default, pull requests only on
Joel's request with the request recorded in the body, `requested-by-joel` checking it, CI on every
branch push, deployment steps required in every pull request and handover, draft machinery and its two
hooks removed.
Open: this branch awaiting Joel's decision to have a pull request opened. #43 with TechPad Gen — it is
a draft, which under this rule is simply a pull request that exists; its three blockers are unchanged.
Need from TD: nothing, this is the TD.

## 2026-09-12 22:00 — merge order as a gate check, with its own live case

Joel's addition, and a good one: consider merge order when several merges are on the table. Written
with four failure modes rather than as a principle, because "consider the order" without cases is
advice nobody acts on.

**It had a live instance within the hour, which is why the rule earns its place.** #43 is now clean and
green — TechPad Gen brought `main` in, and all five matrix jobs passed on `8cf161f`, the first time CI
has ever run on that branch. Its body carries no `Requested by Joel` line, because it was opened days
before that rule existed. So merging my rule branch first would turn a finished, in-flight pull request
red for a rule that did not exist when it was written — and a retroactive failure reads as the author's
mistake, not the rule's.

**Order: #43 first, then this branch.** Recorded rather than merely decided.

Checked rather than assumed that the order is otherwise free: #43 touches `apps/home` plus its own
handoff and worklog; this branch touches `CLAUDE.md`, the TD charter, `settings.json`, two workflows,
the ledger and this worklog. No overlap, so nothing conflicts in either direction — the ordering is
purely about who gets failed by a rule they never saw.

**TechPad Gen corrected me and is right, recorded because it should not be silent.** I had suggested
`/admin` was the tool for deriving which commit production serves. It is not: the page names that as an
explicit blind spot, because Vercel exposes the deployed SHA to an app but never to a sibling. The
Vercel API answers it, which is what they used. Their handling of the original error is also better than
what I asked for — four documents each named a different production commit, every one correct when
written, so rather than writing a fifth they recorded **where the answer is derivable**. That is the
right fix and I would not have specified it.

## 2026-09-12 22:00 — handoff
Landed on the branch, still no pull request: the merge-order check in `CLAUDE.md` Merging and in the TD
charter, above the request/deployment check so it is read first.
Open: this branch awaiting Joel's decision to have a pull request opened, and it merges **after** #43.
#43 itself is gate-clean and awaiting his word.
Need from TD: nothing, this is the TD.

## 2026-09-12 22:30 — merge Coffee's brew log: #51, #52, #53

Joel: "Merge coffee app." Three stacked pull requests, each based on the one before, so the order was
forced rather than chosen — which is the merge-order check's easiest case and, as it turned out, its
most instructive.

**The migration was the real gate work.** It drops four columns from `coffee.bags`, and the note said
that was safe. I verified it against the live database instead of accepting it: three bags, one
`my_method` of `'other'`, every other dial-in column entirely null. Also grepped the final tree for
references to the dropped columns — none. Then applied it **as the merge landed**, which is what the
agent's own deployment section asked for, and it was right: applying earlier would have left the
deployed app unable to save a scan, because the running code still read those columns.

Verified after: 3 bags intact, `coffee.brews` present with RLS on and zero policies, `purchased_date`
added, no dropped column remaining, `extraction_yield` reported `ALWAYS` generated. Then the arithmetic
no unit test can reach — dose 15g, beverage 250g, TDS 1.35% computed 22.50, matching `250 × 1.35 ÷ 15`.

**A mistake caught only because I re-checked.** I inserted and deleted that test row in one statement.
The delete could not see the insert in its own snapshot, so the row survived — while the same query
reported zero brews, because that count read the same pre-statement snapshot. A fresh query found it
and I removed it properly. **A count read inside the statement that wrote it proves nothing**, and had
I trusted it I would have left test data in Joel's library and reported it clean.

**The new lesson, now in the brief and the charter: a squash merge conflicts the rest of its own
stack.** Squashing #51 rewrote it as a commit git cannot match to what #52 was built on, so #52
conflicted; then #53 conflicted in three files, two of them app code. None was a real disagreement.
The test that settles it rather than guessing: compare the base branch's copy of each conflicted file
against what the stacked branch already inherited. On #53 all three were byte-identical and the handoff
was a strict superset, so taking the branch side was lossless as a fact. **Where they differ it is a
genuine conflict in another agent's logic and is not mine to resolve** — that distinction is what keeps
this from becoming licence to pick between two versions of somebody else's code.

Also corrected a claim I made mid-gate: I reported `tsc --noEmit` clean when the command had actually
errored and my shell test was reading the wrong exit code. The error was real but benign —
`next-env.d.ts` had not been generated yet — and it passes after `npm run build`, which is the order
CI uses. Worth recording because the wrong thing to do would have been to quietly re-run it and move on.

## 2026-09-12 22:30 — handoff
Landed: #51, #52 and #53 on `main` at `872f3aa`, migration applied and verified, `tp-coffee-app` green
in production. `main` merged into this branch; the squash-stack lesson added to `CLAUDE.md` and the TD
charter.
Open: this branch still has no pull request and is waiting on Joel to ask for one. Two tidy-ups on his
list — deleting the abandoned `claude/coffee-rework-the-bag-form`, and the domain map still calling
Coffee "built, not yet deployed".
Need from TD: nothing, this is the TD.

---

## 2026-09-14 — build only the apps a change actually touches

Joel: "lets only push the apps we are updating if possible." Every push was building all five
apps — confirmed against the Actions API, where a commit touching only `CLAUDE.md`, the TD charter,
the ledger and a worklog still ran `build (home)`, `(editor)`, `(resume)`, `(tracker)` and `(coffee)`.

**The obvious implementation is the wrong one, and it would have been expensive to discover.** A
workflow-level `paths:` filter *skips* jobs, and a skipped job never reports a status at all.
Branch protection requires these checks by name, so an unsatisfied required check means the pull
request can never merge. Slow builds traded for permanently stuck merges — the same shape as the
`Promotion / approval-recorded` name I nearly handed Joel, where a required check matching nothing
would have blocked the whole repo.

So every job still runs and still reports. The scoping happens *inside* the job: a first step
compares the app's folder against the merge base with `main` and sets an output, and every
subsequent step is gated on it. Nothing to build means a green tick in seconds instead of a minute.

Scope is the app's own folder plus `.github/workflows` and `supabase` — the workflow can change how
every app is built, and a migration can break any app that reads the schema. **Pushes to `main`
always build everything**, because a merge commit can break an app whose folder it never touched,
and `main` is what production deploys from.

Simulated against four real merges before committing: #48 (coffee only) builds coffee alone, #43
(hub only) builds home alone, #47 (documentation) builds nothing, and #53 (coffee plus a migration)
correctly builds all five.

**The Vercel half is deliberately not in this commit.** Vercel's ignore rule can live in
`vercel.json` as `ignoreCommand`, which would be version-controlled and visible in a diff — much
better than a dashboard setting, and it fits this project's objection to config that leaves no
trace. But an unrecognised key in `vercel.json` can fail the build outright, and doing that to all
five projects at once is how the last deploy outage felt. It is offered as a dashboard command Joel
can paste, with the `vercel.json` version worth trying on one app first.

## 2026-09-14 — handoff
Landed on the branch, no pull request: per-app build scoping in `ci.yml`.
Open: this branch is finished and awaiting Joel's decision to have a pull request opened. The Vercel
half is a deployment step for him, not code.
Need from TD: nothing, this is the TD.

## 2026-09-14 22:45 — pull request opened, on Joel's ask

Joel: "merge your pr". Opened #57 from `403531d` and recorded the request in the body, per the rule
that landed in #55 — the first pull request opened under it.

Gate check on my own work, run the same way I would run it on anyone else's:

- **CI green on `403531d`** — all five matrix jobs, run 129, and all five genuinely built, because
  the commit touches `.github/workflows` which is in scope for every app. The change does not exempt
  itself from its own rule, which is the case worth checking.
- **Handoffs.** Mine was stale in two places and both are fixed here rather than left for the next
  session. It still described #43 as open and sent back; #43 merged on 09-12 and #54 deleted the
  worklog it orphaned. And the thing this change makes newly true needed writing down: **a green
  `build (app)` no longer means that app was built.** A handoff that let the next TD read a skipped
  job as proof of a compile is precisely the confidently-wrong document this project keeps paying
  for.
- **Deployment section** — written, and it is not "nothing". The GitHub half is complete on merge;
  the Vercel half is a per-project Ignored Build Step, offered as a command to try on one project
  first, with the reason `vercel.json` is the better home and still not the right first move.
- **Merge order** — #56 was open and mergeable. It is not mine to merge and Joel did not ask for it,
  so it stays. Checked both directions anyway: no shared file, and a merged workflow change does not
  re-run an open pull request's checks, so #57 cannot turn #56 red.

One thing I am not claiming. **The skip path has still never run in CI.** Every commit on this branch
touches the workflow directory, so every job built. It was simulated against four real merges and it
matched, but simulation is not execution and the body says so. The failure mode is a red job, not a
false green.

## 2026-09-14 22:45 — handoff

Landed: #57 — per-app build scoping in `ci.yml`, the handoff correction, and the ledger entry.
Open: the Vercel half, which is Joel's dashboard step, not code. #56 sits gated-but-unmerged until
he asks.
Need from TD: nothing, this is the TD.
