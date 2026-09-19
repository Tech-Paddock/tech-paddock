# Health — handoff

State as of 2026-09-19. Read `RULES.md` and `.claude/HEALTH-PLAN.md` first.

---

## The macro log is live

Merged as #122 and deployed. Dictate what you ate, approve the draft, it is logged with the day's
running total. `/debug` runs both models on one food and keeps every run.

**The database is empty.** Zero rows in every table, measured 2026-09-19. Nothing has been
logged and the harness has never run, so there is no evidence yet about the thing it was built to
measure.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. Exact match on the normalised
name; a miss goes outside to one model call that may search; approval writes it back, so the
outside path runs at most once per distinct food.

**Item numbers are append-only.** `health.items` is identity, `health.item_versions` is what it
weighed over time. Nothing is updated in place.

**`kind` is the column that cannot be retrofitted.** A `correction` says the number was always
wrong and reaches backwards through its era; a `change` says the food itself changed and does not.
Settled in [#116](https://github.com/Tech-Paddock/tech-paddock/issues/116). `correction` is the
default deliberately — guessing it wrong is visible, guessing `change` wrong strands old days.

**Read `lib/items.ts:resolveVersion` first.** Take the era with the greatest `effective_from` on or
before the day, then within it the most recently written row. Thirteen tests pin it.

**Entries reference an item's identity, never a copy of its numbers**, which is why `readDay`
resolves per day. Tapping a logged food opens `app/Correction.tsx`, which also lists earlier
versions — that is what makes the append-only guarantee checkable rather than a promise.

## Agreed with Joel, not started

**Targets, a dashboard, and deleting a meal.** A preset page taking calorie and macro targets that
rebalance against each other; a dashboard reading consumed against left; deleting an entry, which
takes its lines with it. Mockups exist and Joel approved their four commitments on 2026-09-19:

1. **A target needs an effective date**, for the reason `kind` exists — change your budget in March
   and February must still be scored against February's.
2. **Deleting an entry must not delete the food.** The cascade drops `entry_items`; `health.items`
   and its versions stay, or a mis-logged lunch throws away approved macros.
3. **None of it calls a model.** Joel: *"macro tracker should only be reading from database."*
4. **The split clamps at zero** rather than showing a negative gram.

**Recipes are parked on a charter change** Joel said he would make. A book is a library, therefore
an index, and this app is settled as one screen with no index. He has also said Health *"will be
surfaced as an app"*. **Do not start the recipe build before the charter lands.**

**One question still open:** how wrong can a recipe's macros be before it matters? It decides
whether a recipe needs correcting after you have cooked it a few times, or whether one estimate at
creation is the end of it.

## Traps specific to this seat

- **`lib/models.ts` is Coffee's registry copied verbatim, flagged rather than quiet.** Approved in
  #116. Do not let a third copy happen quietly, and do not cite a ledger number in a comment — that
  is what this one already got wrong once.
- **The livery is borrowed and has a collision.** `senna`, which the tracker also wears, maps
  `--sev-warn` onto the accent — so "over target" and "on track" would be one colour. The mockups
  use the reserved danger colour instead. **Both TechPad Gen's to settle**, not yours.
- **A failed lookup must never look like "not found."** `LookupError` keeps them apart and every
  route turns it into a 503. Degrading into internet-first changes nothing on screen.
- **`eaten_at` is not the time you ate.** The app never sets it, so it duplicates `created_at`.
  `eaten_on` is what a day's total reads. Both now carry column comments saying so.
- **The hosted API stamps its own version and ignores your filename.** #122's migration was
  renamed at the gate to match what ran. Check `migration list` rather than assuming.

## Next

**Use it before building more.** The harness answers one question — does Haiku reproduce a number
you already approved — and cannot answer it without runs.

Two numbers Joel has not set, neither blocking: **the agreement rate that retires the harness** and
**the divergence tolerance** (now 10%-or-25 kcal on calories, 20%-or-5 g on macros).
