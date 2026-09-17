# Health — plan

A dictated food log for the iPhone. Say what you ate, Claude works out what it means, you approve
it, it is logged.

Joel, on what it is for: **"it is used to record input and track macro nutrients across the day."**
Macros here are macronutrients — protein, carbohydrate, fat — and calories beside them.

**Status: agreed in conversation on 2026-09-16, nothing built and nothing approved. Not a charter**
— a charter is approved before it is written and there is no agent folder yet. This is the record of
what was decided while the shape was being talked through, so the session that eventually builds it
does not start from a summary of a summary.

**No app folder, no schema, no Vercel project, no branch.** The name is settled — see below — so
`health` is the name and not a description, but nothing has been built under it yet.

**This file is temporary.** It lives here rather than under `.claude/agents/` because creating that
folder before the agent exists makes `drift` warn about a missing handoff, and because the channel
table in `CLAUDE.md` describes standing channels rather than one-off planning notes. When the
charter is written and approved it absorbs this file, and this file is deleted.

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

A Chick-fil-A #1 is one row, even though it is three things in the bag. A #1 and a cookie is two
rows.

**The item name carries the whole specification.** "Chick-fil-A #1", "Chick-fil-A sandwich", "large
fry", "medium fry" are four remembered items with four sets of numbers. No components, no modifiers,
no per-instance overrides. Want precision, say more words.

The rejected version decomposed a combo so "I skipped the fries" could remove a part — but that is
not how you talk; you name what you actually ate. Keeping the combo whole also makes the cache work
harder: "#1 from Chick-fil-A" is one row hit hundreds of times, where decomposing caches three
things and recombines them on every log.

### Your database is read before anything external

1. **Exact match** in your table — free, instant, no model call, identical to last time.
2. **Near match** on the normalised item name. Needs the parse first, so it matches parsed names,
   not raw dictated text.
3. **Miss → outside.** Web search for branded items that publish real numbers; a model estimate for
   "two eggs and toast", where searching buys nothing.
4. **Approval writes it back**, so tier 3 runs at most once per distinct food, ever.

**The reason is correctness, not cost.** A web search will cheerfully overwrite a correction you
already made. Database-first means your approved rows are authoritative and never relitigated by a
source that does not know your habits.

`apps/coffee/lib/bags.ts` does the second-order version worth copying: `findRoasterDomain` lets a
verified domain pin the next search rather than merely skip it. Once Chick-fil-A resolves once,
later lookups go to their published page instead of whatever a search surfaces.

### Corrections are dictated, and they fix the canonical row

Because the name carries the specification, a correction is never "I ate less of that" — it is "that
item's numbers are wrong." So it sticks forever. The "remember this, or just today?" prompt from an
earlier draft is unnecessary and dropped.

Correcting the draft before approving is the easy case. Correcting something already logged resolves
to the most recent matching row.

### It does not appear on the hub's glance

Joel, asked whether it belongs there: **"leave it off for now."** So no `/api/summary`, no line in
`SOURCES` in `apps/home/lib/glance.ts`, and no request to TechPad Gen. It is a tool you click into.
Adding it later is one endpoint and one ledger row, so nothing here forecloses it.

### Claude guesses the meal slot

Timestamp defaults to now; Claude infers breakfast/lunch/dinner/snack from the clock and the
content; editable.

### Every number carries its provenance

Your log, the web, or an estimate — and which model produced it. Not decoration: it tells you which
line to scrutinise, and it is load-bearing for the harness below.

### Models: Haiku 4.5 default, Sonnet 5 available

Sonnet 4.6 deliberately left out — two models is a clean experiment.

- **A registry, not two strings.** Haiku 4.5 returns a 400 for `output_config.effort` outright and
  web tool versions differ between models, so a bare swap is an error. This is why
  `apps/coffee/lib/models.ts` exists; copy its shape.
- **No effort dial.** Sonnet 5 accepts one, Haiku rejects one. Two models is clean; two models times
  five effort levels is a chore.
- **Only the judgment call gets a model choice.** Parsing "a number one from Chick-fil-A" into one
  item is a Haiku job at any setting. Coffee puts its toggle on `/api/search`, not `/api/identify` —
  parse pinned to Haiku, the estimate is what varies.

## The name — settled 2026-09-17

**`health`.** It fixes the folder `apps/health`, the subdomain `health.techpaddock.io`, the Vercel
project `tp-health` and the Postgres schema `health`, all at once, and all of them are expensive to
change afterwards.

**Joel's reason is the design constraint, not a footnote:** *"health, I see this expanding."* He
rejected the narrower candidates deliberately. `fuel` and `intake` both name the *macro* feature,
and a name that describes one feature is a ceiling on the app the moment a second one arrives.

**So everything below is the first feature of `health`, not the whole of it.** Read it that way.
Where a decision here would be wrong for a second kind of record — weight, sleep, a workout — it is
a decision about the macro tables specifically and says so, or it needs revisiting before the schema
is written. The schema is named for the app, so it holds many tables by design; what must not happen
is the first tables being shaped as though they were the only ones.

**This file was `MACRO-TRACKER-PLAN.md` until the name was settled.** Renamed rather than left
alone, because the app is not the macro tracker.

## Guardrails — approved 2026-09-17

**A guardrail is something that stays wrong even when it would make the app better.** That is the
test each of these had to pass, and it is why they are written here rather than left to judgement:
every one of them is a rule the agent will at some point have a good local reason to break.

Drafted by the technical director from what Joel had already written or decided, put to him as six
candidates to strike or approve, and approved in full — **none struck**. They become the `Never`
section of the new agent's `RULES.md` when the charter is written, and they do not get renegotiated
inside a feature.

1. **Never write without approval.** The draft is not the log. Approving is the only thing that
   writes.
2. **Never let a failed lookup look like "not found."** A database error surfaces; it never falls
   through to the web. This is Coffee's trap and the one that would quietly undo the whole design —
   nothing on screen changes, the numbers just start drifting again.
3. **Never replace a hand-entered number without keeping the old one.** The correction made by hand
   is the only real ground truth in the system.
4. **Never put real food-log data in the repo.** Fixtures are invented food. The database is the
   right home for what was actually eaten.
5. **Never read or write another tool's schema.** Settled already; writing it down is what keeps it
   settled.
6. **Never estimate when the table already knows.** Database-first is a correctness rule, not a cost
   optimisation — bypass is a deliberate tap and never a default.

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
**numeric tolerance, not string equality** — 620 vs 625 is agreement, 620 vs 890 is not. Tolerance
not yet chosen.

### The picks are recorded, or it is not validation

Your choice is the label — the only ground truth in the system. Store the input text, both outputs,
which you kept, and when, **on its own table, away from the food log**. After fifty picks you can
say "Haiku matched 46 of 50," and that number ends the validation period.

### A pick is allowed to win

Table says 620, Haiku says 625, Sonnet says 890 — you can take one and have it stick. A pick can
overwrite the canonical row, deliberately, and the row records that a debug run changed it and which
model produced the new number.

### Two mechanics

Calls run **in parallel and independently**, or the comparison is contaminated. Debug mode is slower
and costs roughly double — fine for a validation window, worth knowing before wondering why it got
sluggish.

## Traps this repo has already paid for

### "Not found" and "could not ask" are the same null row

From `apps/coffee/lib/bags.ts`: "No previous purchase" and "the lookup failed" are both a null row,
and only one of them is an answer. Swallowing the error made an unreachable database look like a
first-time coffee.

**Specifically nasty here:** if the lookup silently fails, the app does not error — it degrades into
internet-first and keeps working. Nothing on screen changes; the numbers just quietly start drifting
again, which is the one thing this design exists to prevent. Coffee's `LookupError` class solves it;
take it wholesale.

### The debug route needs no middleware edit

`apps/home/app/(shell)/admin/page.tsx` is already a second surface in the same app, and the matcher
is a catch-all negative — `/((?!_next/static|_next/image).*)` — so any extra route is behind the
password gate automatically. That matters, because `middleware.ts` is gated on the TD and the debug
surface must never need it.

---

## What the technical director would raise at the gate

**In [issue #98](https://github.com/Tech-Paddock/tech-paddock/issues/98)**, at Joel's request, rather
than in this file — so the recommendations stay plainly the technical director's and this document
stays plainly Joel's. One home, and this line is the pointer to it.

The two worth reading before any schema is written are the same finding from opposite ends: **a
winning debug pick overwrites the very row this design calls authoritative**, and **every such
overwrite converts hand-entered ground truth into a model-derived number**, so the statistic the
harness exists to produce is measured against a pool the harness itself keeps shrinking.
