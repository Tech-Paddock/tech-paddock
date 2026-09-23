# Health — handoff

State as of 2026-09-23. Read `RULES.md` and `.claude/HEALTH-PLAN.md` first. Open items: Linear, TEC.

---

## The macro log is live

Merged as #122 and deployed. Dictate what you ate, approve the draft, it is logged with the day's
running total; `/debug` runs both models on one food and keeps every run. **Every table is still
empty, measured 2026-09-20** — nothing logged, the harness never run, nothing to measure yet.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. Exact match on the normalised name;
a miss goes outside to one model call; approval writes it back, so outside runs once per food ever.

**Item numbers are append-only.** `health.items` is identity, `health.item_versions` is what it
weighed over time, nothing updated in place. **`kind` cannot be retrofitted**: a `correction` says
the number was always wrong and reaches backwards through its era, a `change` says the food itself
changed and does not. Settled in [#116](https://github.com/Tech-Paddock/tech-paddock/issues/116);
`correction` is the default deliberately, because guessing it wrong is visible and guessing `change`
wrong strands old days.

**Read `lib/items.ts:resolveVersion` first.** Era with the greatest `effective_from` on or before the
day, then the most recent row in it. Entries reference identity and never a copy of the numbers, so
`readDay` resolves per day; `app/Correction.tsx` lists earlier versions, which makes it checkable.

## The grocery list

`/list` adds lines, ticks them off, copies the lot, or taps one into a King Soopers search. **It
leaves as text or a link — no stored credential, no OAuth, no `middleware.ts` edit**, the cheap
version Joel chose over pushing into a Kroger cart. **Tidy is the one model call and it is two-step**:
Haiku proposes a merge, `validateTidy` refuses one that drops or double-counts a line before you see
it, you approve what survives. A prompt can only ask, and this is the one screen where a model's
output would delete something you typed.

**Recipes left on 2026-09-20** for their own app and schema; you read them to price a meal and own
none of them. **The list follows them to Cookbook** (TEC-15, sequence approved 2026-09-23) and is
still here until TEC-23 lands. `RULES.md` on `main` still reads as though it is permanently yours;
the charter drafts are on the TD's `claude/brief-grocery-move`.

## Agreed with Joel, not started

**Targets, a dashboard, and deleting a meal.** Targets that rebalance against each other; consumed
against left; deleting an entry takes its lines. Joel approved the mockups' commitments 2026-09-19:

1. **A target needs an effective date**, for the reason `kind` exists — change your budget in March
   and February is still scored against February's.
2. **Deleting an entry must not delete the food.** The cascade drops `entry_items` only, or a
   mis-logged lunch throws away approved macros.
3. **None of it calls a model.** Joel: *"macro tracker should only be reading from database."*
4. **The split clamps at zero** rather than showing a negative gram.

## Traps specific to this seat

- **`lib/models.ts` is Coffee's registry copied verbatim, flagged rather than quiet.** Approved in
  #116. Do not let a third copy happen quietly, and do not cite an issue number in a comment.
- **The livery is borrowed and has a collision.** `senna`, which the tracker also wears, maps
  `--sev-warn` onto the accent, so "over target" and "on track" are one colour. The mockups use the
  danger colour instead. **Both TechPad Gen's to settle**, not yours.
- **A failed lookup must never look like "not found."** `LookupError` keeps them apart and every
  route turns it into a 503. Degrading into internet-first changes nothing on screen.
- **`eaten_at` is not the time you ate.** The app never sets it, so it duplicates `created_at`;
  `eaten_on` is what a day's total reads. Both carry column comments.
- **The hosted API stamps its own version and ignores your filename.** #122's was renamed at the
  gate to match what ran. Check `migration list` rather than assuming.
- **`www.kingsoopers.com` is refused by the egress proxy**, so the `/q/` search shape could not be
  verified live. One constant in `lib/grocery.ts`, and its comment says how much it is worth.

## Next

**Use it before building more** — without runs the harness cannot say whether Haiku reproduces a
number you already approved. Unset by Joel, neither blocking: **the agreement rate that retires the
harness** and **the divergence tolerance** (10%-or-25 kcal, 20%-or-5 g).

**Filed and waiting — start none of them until its blocker clears:**
- **TEC-21** — snapshot macros onto entries at log time, your 2026-09-22 proposal. Joel's go.
- **TEC-23** — `/list` redirects to Cookbook, grocery code goes, no migration. Cookbook's list URL.
- **TEC-25** — read recipe macros from Cookbook's `/api/servings`. That endpoint live; after TEC-21.
