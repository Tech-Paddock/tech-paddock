# Health — handoff

State as of 2026-09-19. Read `RULES.md` and `.claude/HEALTH-PLAN.md` first.

---

## The macro log is live

Merged as #122. Dictate, approve the draft, it is logged with the day's running total; `/debug` runs
both models on one food. **The database was empty at 2026-09-19** — nothing logged, harness never
run, so still no evidence about the thing it was built to measure.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. Exact match on the normalised name;
a miss goes outside to one model call; approval writes it back, so outside runs once per food ever.

**Item numbers are append-only.** `items` is identity, `item_versions` is what it weighed, nothing
updated in place. **`kind` cannot be retrofitted**: a `correction` says the number was always wrong
and reaches backwards through its era, a `change` says the food changed and does not
([#116](https://github.com/Tech-Paddock/tech-paddock/issues/116)). `correction` is the default:
guessing it wrong is visible, guessing `change` wrong strands old days. **Read
`lib/items.ts:resolveVersion` first** — era with the greatest `effective_from` on or before the day,
then the most recent row in it. Entries reference identity, never a copy of the numbers.

## The grocery list

`/list` adds lines, ticks them off, copies the lot, or taps one into a King Soopers search — **text
or a link, no stored credential, no OAuth, no `middleware.ts` edit**, the cheap version Joel chose
over a Kroger cart. **Tidy is the one model call and it is two-step**: Haiku proposes a merge,
`validateTidy` refuses one that drops or double-counts a line *before you see it*, you approve what
survives. A prompt can only ask. (The `/q/` search URL shape is unverified — the proxy blocks the
store; see the comment on the constant.)

## The recipe book, and the link that makes it cheap

`/recipes` — type one, ask Claude for one, or paste a URL. All three end at one approval; the draft
is not the book. **Read `lib/recipes.ts:saveRecipe` first**, because **a recipe owns exactly one
`items` row**, named after it, whose single version holds ONE SERVING. That is the whole design:
`lib/log.ts` knows nothing about recipes, so logging resolves at tier 1 — your table, no model —
with quantity as servings eaten. **The book stores the pot, the item stores a serving**; `perServing`
and `wholeRecipe` must agree or a day's total is silently wrong.

**Macros are static** (Joel, against the agent's advice) and **import never lifts a page's numbers**
— *"Only retain recipe. Then calculate macros and cals"* — so an import reads `estimate`, never
`web`. **A page that could not be read is refused, not guessed**: the prompt asks for `read: false`
and `importRecipe` *also* rejects a "read" page with no ingredients, because a prompt can only ask
and a slug is enough to invent a convincing chilli. **Removing a recipe keeps the food and every day
you ate it** — the cascade runs items → recipes, not the other way.

## Agreed with Joel, not started

**Targets, a dashboard, deleting a meal.** Targets that rebalance; consumed against left; deleting
an entry takes its lines. Joel approved four commitments on 2026-09-19:

1. **A target needs an effective date**, for the reason `kind` exists — March's budget must not
   rescore February.
2. **Deleting an entry must not delete the food.** The cascade drops `entry_items` only.
3. **None of it calls a model.** Joel: *"macro tracker should only be reading from database."*
4. **The split clamps at zero** rather than showing a negative gram.

## Traps specific to this seat

- **`lib/models.ts` is Coffee's registry copied verbatim, flagged rather than quiet** (#116). Do not
  let a third copy happen quietly, and do not cite a ledger number in a comment.
- **The picker is model-only, no effort dial** — Joel handed that call over on 2026-09-19. It sits
  on the recipe draft, the judgement; reading the book calls nothing.
- **The livery is borrowed and `senna` maps `--sev-warn` onto the accent**, so "over target" and
  "on track" are one colour. Mockups use danger instead. **TechPad Gen's to settle**, not yours.
- **A failed lookup must never look like "not found."** `LookupError` keeps them apart; every route
  turns it into a 503. Degrading into internet-first changes nothing on screen.
- **`eaten_at` is not the time you ate.** Never set, so it copies `created_at`; `eaten_on` is read.
- **The hosted API stamps its own migration version and ignores your filename** — #122's was renamed
  at the gate. Check `migration list` rather than assuming.

## Next

**Use it before building more** — without runs the harness cannot say whether Haiku reproduces a
number you approved. Unset by Joel, none blocking: **the agreement rate that retires the harness**,
**the divergence tolerance** (10%-or-25 kcal, 20%-or-5 g), and how wrong a recipe may be.
