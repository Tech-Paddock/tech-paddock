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
