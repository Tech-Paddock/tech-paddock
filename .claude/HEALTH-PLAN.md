# Health — plan

A dictated food log for the iPhone. Say what you ate, Claude works out what it means, you approve
it, it is logged.

Joel, on what it is for: **"it is used to record input and track macro nutrients across the day."**
Macros here are macronutrients — protein, carbohydrate, fat — and calories beside them.

**This is the reasoning, not the rules and not the state.** It records what was decided with Joel
from 2026-09-16 on, while the shape was being talked through, so the session that builds a feature
does not start from a summary of a summary. `.claude/agents/health/RULES.md` carries the rules and
binds; this explains why each one exists. Where the two ever disagree, the charter wins. **Read it
before designing or changing a feature**, not every session.

**What is built is not written here.** `.claude/agents/health/HANDOFF.md` says what is true right
now and `/admin` probes the running system — a build-state paragraph in this file went stale the day
the app was scaffolded, which is why there is no longer one.

**It was meant to be temporary and it is not.** The plan was to fold it into the charter and delete
it; folding it in would have meant throwing most of Joel's reasoning away. So the rules moved to the
charter and the reasoning stays here, read as the *first feature* of `health` rather than the whole
of the app.

---

## What it is

**One screen.** A text box you dictate into with the iPhone keyboard's mic key, a draft of what
Claude understood, and today's log underneath. **You approve the draft before anything is written.**

> "Chick-fil-A number one with a large Diet Coke"

becomes an editable row — item, calories, protein, carbs, fat — that you accept or fix. Approving is
what writes.

**Dictation needs nothing built.** The mic key on the iOS keyboard dictates into any `<textarea>`.
No audio capture, no upload, no Web Speech API, no permission prompt.

**Coffee is already this app with a different input.** `apps/coffee/app/api/identify/route.ts`
interprets an input and returns the interpretation without storing it; the page renders it as a
draft; a second call to `/api/bags` writes. Approve-before-log is a working pattern here, not a new
idea.

## Settled

### Scope: macros and calories only

Exercise is dropped. Two consequences: the two-tab structure existed to separate food from exercise,
so with exercise gone it is one screen. And the expensive schema question goes with it — lifting
wants session → sets with reps and weight, cardio wants duration and distance, and the two share
almost no columns.

### Rows split on things you ordered, not components

The rule is the charter's. The rejected version decomposed a combo so "I skipped the fries" could
remove a part — but that is not how you talk; you name what you actually ate. Keeping the combo
whole also makes the cache work harder: "#1 from Chick-fil-A" is one row hit hundreds of times, where
decomposing caches three things and recombines them on every log.

### Your database is read before anything external

The order is the charter's. **The reason is correctness, not cost.** A web search will cheerfully
overwrite a correction you already made. Database-first means your approved rows are authoritative
and never relitigated by a source that does not know your habits — and approval writing the answer
back means the outside tier runs at most once per distinct food, ever.

Coffee once pinned a follow-up search to a roaster domain it had verified. **Do not copy that**: it
was removed in #176 because pinning narrowed the only channel by which a page enters the
conversation, and the pinned search found nothing where the unpinned one found the recipe.

### Corrections are dictated, and they fix the canonical row

Because the name carries the specification, a correction is never "I ate less of that" — it is "that
item's numbers are wrong." So it sticks forever. The "remember this, or just today?" prompt from an
earlier draft is unnecessary and dropped.

Correcting the draft before approving is the easy case. Correcting something already logged resolves
to the most recent matching row.

**A correction does not reach backwards — settled 2026-09-22, answering #116; go given 2026-09-24.**
An entry snapshots the item's numbers when it is logged, so a past day's total never moves and a read
is a plain sum. **The entry also stores the item id and the version it snapshotted.** Nothing
recomputes, but a backfill stays possible; without the reference, every day logged before a
correction is wrong permanently, which is the one irreversible choice in this design. The code
catches up through TEC-21.

### It does not appear on the hub's glance

Joel, asked whether it belongs there: **"leave it off for now."** The consequences are the charter's.

### Claude guesses the meal slot

Timestamp defaults to now; Claude infers breakfast/lunch/dinner/snack from the clock and the
content; editable.

### Every number carries its provenance

Your log, the web, or an estimate — and which model produced it. Not decoration: it tells you which
line to scrutinise, and it is load-bearing for the harness below.

### Models: Haiku 4.5 default, Sonnet 5 available

The rules are the charter's. Sonnet 4.6 was deliberately left out — two models is a clean experiment,
and two models times five effort levels is a chore. Only the judgment call gets a model choice,
because parsing "a number one from Chick-fil-A" into one item is a Haiku job at any setting.

## The name — settled 2026-09-17

**`health`.** It fixes the folder `apps/health`, the subdomain `health.techpaddock.io`, the Vercel
project `tp-health` and the Postgres schema `health`, all at once, and all of them are expensive to
change afterwards.

**Joel's reason is the design constraint, not a footnote:** *"health, I see this expanding."* He
rejected the narrower candidates deliberately. `fuel` and `intake` both name the *macro* feature,
and a name that describes one feature is a ceiling on the app the moment a second one arrives.

**So everything here is the first feature of `health`, not the whole of it.** Read it that way.
Where a decision here would be wrong for a second kind of record — weight, sleep, a workout — it is
a decision about the macro tables specifically and says so, or it needs revisiting before that
schema is written. The schema is named for the app, so it holds many tables by design; what must not
happen is the first tables being shaped as though they were the only ones.

**This file was `MACRO-TRACKER-PLAN.md` until the name was settled.** Renamed rather than left
alone, because the app is not the macro tracker.

## Guardrails — approved 2026-09-17

**A guardrail is something that stays wrong even when it would make the app better.** That is the
test each one had to pass, and it is why they are written down rather than left to judgement: every
one of them is a rule the agent will at some point have a good local reason to break.

Drafted by the technical director from what Joel had already written or decided, put to him as six
candidates to strike or approve, and approved in full — **none struck**. They are the `Never`
section of the charter, which is their one home, and they do not get renegotiated inside a feature.

## The debug harness

Not the model toggle. Normal mode runs Haiku alone. **Debug mode runs both on the same input, in
parallel and independently, and hands you two drafts.**

### It must be able to bypass the cache

Database-first means for anything you have eaten before, neither model runs — you get your stored
number and there is nothing to compare. **The foods you eat most, whose numbers matter most, are
exactly the ones the harness would never see.**

So debug mode can force a re-estimate and show three columns: your table, Haiku, Sonnet. That
answers the real question — does Haiku reproduce the number you already approved? Bypass is a
deliberate tap, not the default, or you pay two model calls for everything you log.

### Column one has to say where it came from

If your stored number was itself produced by Haiku three weeks ago, "table vs Haiku" is Haiku-then
against Haiku-now — run-to-run variance that looks exactly like agreement. **A match against a
hand-entered number is evidence; a match against Haiku's own earlier guess is not.** They must look
different on screen or the validation stat quietly inflates.

### Only ask when they actually disagree

Auto-collapse agreement and record it as a match; surface a choice only on real divergence. Needs a
**numeric tolerance, not string equality** — 620 vs 625 is agreement, 620 vs 890 is not. Joel has not
chosen the tolerance.

### The picks are recorded, or it is not validation

Your choice is the label — the only ground truth in the system. Store the input text, both outputs,
which you kept, and when, **on its own table, away from the food log**. After fifty picks you can
say "Haiku matched 46 of 50," and that number ends the validation period.

### A pick is allowed to win

Table says 620, Haiku says 625, Sonnet says 890 — you can take one and have it stick. **A pick wins
by appending a new version, never by overwriting the row in place**, and that version records the
debug run and the model behind the number. Reads resolve to the newest, so the pick has the effect
you want and the correction it replaced is still there. **Corrected 2026-09-22 answering #116** —
the earlier wording let a pick overwrite in place, contradicting guardrail 3.

### Two mechanics

Calls run **in parallel and independently**, or the comparison is contaminated. Debug mode is slower
and costs roughly double — fine for a validation window, worth knowing before wondering why it got
sluggish.

## "Not found" and "could not ask" are the same null row

The trap this repo has already paid for, from `apps/coffee/lib/bags.ts`: "No previous purchase" and
"the lookup failed" are both a null row, and only one of them is an answer. Swallowing the error made
an unreachable database look like a first-time coffee.

**Specifically nasty here:** if the lookup silently fails, the app does not error — it degrades into
internet-first and keeps working. Nothing on screen changes; the numbers just quietly start drifting
again, which is the one thing this design exists to prevent. That is why guardrail 2 exists.

---

## What the technical director raised at the gate

**In [issue #98](https://github.com/Tech-Paddock/tech-paddock/issues/98)**, at Joel's request, rather
than in this file — so the recommendations stay plainly the technical director's and this document
stays plainly Joel's. Its central finding — that a winning debug pick would overwrite the row this
design calls authoritative, turning hand-entered ground truth into model-derived numbers — is
answered above: a pick appends a version.
