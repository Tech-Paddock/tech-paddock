# Health — handoff

State as of 2026-09-19.

Read `RULES.md` first, then `.claude/HEALTH-PLAN.md`. This file is only what is true right now.

---

## The macro log is built and is on a branch

`claude/health-macro-log` — pushed, CI green, **no pull request** (Joel has not asked). It replaces
the placeholder page with the real one and adds the schema the app runs on.

**The migration is not applied.** `20260919091628_health_macro_tables.sql` is additive — five new
tables in a schema that had none, verified empty against the live project before it was written — so
it is safe to apply before the code that needs it. The technical director applies it at gate time.

## How it works, in the order it matters

**The lookup order is the product** and it lives in `lib/log.ts:resolveItem`. Exact match on the
normalised name, then a miss goes outside to one model call that may search. Approval writes it
back, so the outside path runs at most once per distinct food.

**Item numbers are append-only.** `health.items` is identity; `health.item_versions` is what it
weighed, over time. Nothing is ever updated in place, which is guardrail 3 made structural rather
than remembered.

**`kind` is the column that is easy to miss and impossible to retrofit.** A `correction` says the
number was always wrong and reaches backwards through its era; a `change` says the food itself
changed and does not. Settled in [#116](https://github.com/Tech-Paddock/tech-paddock/issues/116).
`correction` is the default deliberately — guessing it wrong is visible, guessing `change` wrong
silently strands old days on stale numbers.

**The resolution rule is `lib/items.ts:resolveVersion`, and it is the thing to read first.** Take
the era with the greatest `effective_from` on or before the day, then within it the most recently
written row. Thirteen tests in `tests/items.test.ts` pin it, including the fallback for a day before
any era starts — a null there would render as a silently missing total.

**Entries reference an item's identity, never a copy of its numbers.** That is what makes a
correction fix every past day and a change leave them alone. It is also why `readDay` resolves per
day rather than reading a stored figure.

## What is deliberately not there

- **No effort dial.** Sonnet 5 takes one, Haiku 4.5 returns a 400 for one. Two models is a clean
  experiment; the asymmetry is recorded in `lib/models.ts` rather than left to be rediscovered.
- **No `output_config` on either model call.** JSON is asked for in the prompt and validated in
  code. A model response is untrusted input, so the validation is required either way.
- **No `/api/summary` and no line in the hub's glance.** Settled: *"leave it off for now."*
- **No history screen.** Today only. `readDay` already takes any date, so a second screen is a
  route rather than a rewrite.

## Traps specific to this seat

- **`lib/models.ts` is Coffee's registry copied verbatim, flagged rather than quiet.** The technical
  director approved the copy in #116 and is carrying Health-as-second-copy into the argument for
  `packages/shared`. Do not let a third copy happen quietly.
- **The livery is still borrowed.** `lib/livery.ts` pins `senna`, which the paused tracker also
  wears. TechPad Gen's to settle. Do not fix it here.
- **A failed lookup must never look like "not found."** `LookupError` in `lib/items.ts` is what
  keeps them apart, and every route turns it into a 503 rather than an empty result. Degrading into
  internet-first changes nothing on screen — that is the whole danger.
- **`supabase migration list` will always show one remote-only version**, `20260908235234`. A
  *second* discrepancy means something drifted.

## Next

**Use it for a week before building anything else.** The debug harness at `/debug` exists to answer
one question — does Haiku reproduce a number you already approved — and it cannot answer it without
runs. `health.comparisons` accumulates every run whether or not a pick is made.

Two things Joel has not decided, and neither blocks: **the agreement rate that retires the harness**,
and **the divergence tolerance**, currently 10%-or-25kcal on calories and 20%-or-5g on macros in
`lib/macros.ts`.

**Everything else waiting is in the ledger**, which the `SessionStart` hook prints for you.
