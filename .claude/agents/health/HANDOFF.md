# Health — handoff

State as of 2026-09-19.

Read `RULES.md` first, then `.claude/HEALTH-PLAN.md`. This file is only what is true right now.

---

## The macro log is built and is on a branch

`claude/health-macro-log` — pushed, CI green, **pull request open at Joel's request, 2026-09-19**.
It replaces the placeholder page, adds the schema the app runs on, and lets a number that turned
out wrong be fixed after the fact.

**The migration is not applied.** `20260919091628_health_macro_tables.sql` is additive — five tables
in a schema read live and confirmed empty before it was written — so it is safe to apply before the
code that needs it. The technical director applies it at gate time.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. Exact match on the normalised
name; a miss goes outside to one model call that may search; approval writes it back, so the outside
path runs at most once per distinct food.

**Item numbers are append-only.** `health.items` is identity, `health.item_versions` is what it
weighed over time. Nothing is updated in place, which makes guardrail 3 structural rather than
remembered.

**`kind` is the column that cannot be retrofitted.** A `correction` says the number was always wrong
and reaches backwards through its era; a `change` says the food itself changed and does not. Settled
in [#116](https://github.com/Tech-Paddock/tech-paddock/issues/116). `correction` is the default
deliberately — guessing it wrong is visible, guessing `change` wrong silently strands old days.

**Read `lib/items.ts:resolveVersion` first.** Take the era with the greatest `effective_from` on or
before the day, then within it the most recently written row. Thirteen tests pin it, including the
fallback for a day before any era starts — a null there renders as a silently missing total.

**Entries reference an item's identity, never a copy of its numbers.** That is what lets a
correction fix every past day while a change leaves them alone, and why `readDay` resolves per day.

**Tapping a logged food opens the correction sheet**, `app/Correction.tsx`. It puts the choice as a
question about the food — *the number was wrong* against *the food itself changed* — because that is
the only form in which the answer is knowable. A change asks for the date the food changed and never
defaults to today; the boundary is the only thing a change means. The sheet lists earlier versions,
which makes the append-only guarantee checkable rather than a promise.

## What is deliberately not there

- **No effort dial and no `output_config` on either call.** Haiku 4.5 returns a 400 for an effort
  where Sonnet 5 accepts one; JSON is asked for in the prompt and validated in code, which untrusted
  model output needs anyway. Both argued at their call sites.
- **No `/api/summary`, no line in the hub's glance.** Settled.
- **No history screen.** Today only; `readDay` already takes any date, so that is a route rather
  than a rewrite.
- **No way to re-point a logged line at a different food** — and it is not a correction, so do not
  build it as one. *"A #1 is 540, not 620"* fixes the food's numbers, which the sheet does. *"That
  was a medium, not a large"* says the line references the wrong item: a different write, against
  `entry_items`. **The plan does not say which it means by a dictated correction.** Joel's call.

## Traps specific to this seat

- **`lib/models.ts` is Coffee's registry copied verbatim, flagged rather than quiet.** Approved in
  #116; the TD is carrying Health-as-second-copy into the argument for `packages/shared`. Do not let
  a third copy happen quietly.
- **The livery is still borrowed** — `senna`, which the paused tracker wears. TechPad Gen's.
- **A failed lookup must never look like "not found."** `LookupError` keeps them apart and every
  route turns it into a 503. Degrading into internet-first changes nothing on screen, which is the
  whole danger.
- **`supabase migration list` always shows one remote-only version**, `20260908235234`. A *second*
  discrepancy means something drifted.

## Next

**Use it for a week before building anything else.** The harness at `/debug` answers one question —
does Haiku reproduce a number you already approved — and cannot answer it without runs.
`health.comparisons` keeps every run whether or not a pick is made.

Two numbers Joel has not set, neither blocking: **the agreement rate that retires the harness**, and
**the divergence tolerance**, currently 10%-or-25 kcal on calories and 20%-or-5 g on macros in
`lib/macros.ts`.
