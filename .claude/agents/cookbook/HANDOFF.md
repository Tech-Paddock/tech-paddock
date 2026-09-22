# Cookbook — handoff

State as of 2026-09-22.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**Three branches are pushed, green and unmerged**, each stacked on the last: the produce park, the
TD note, the tabs change. Everything before them is live. `/admin` holds deployment state.

**Remembered brands are live and empty** — `brand_preferences`, RLS on, zero policies, **zero rows**;
its migration was **recorded under the version its filename declares**, unlike the three in item 26.
**The seed has not arrived** — receipts read elsewhere, JSON into **Paste a batch**, validated row by
row, **no receipt reaching this app**; format in #165's body.

**Six things are pending on the TD** and reshape this area — Joel agreed tabs on 2026-09-22. They
belong in the ledger, which only the TD writes, and went to Joel in that day's sign-off.

**Four brand-panel gaps, named by Joel 2026-09-20, not built** — his call, his order: nothing
**exports** the table; **import writes on trust** (shape is checkable, judgement is not); the panel
**hides `note`**; a brand needs **a line already on the list**.

## What is true now

**Two tabs since 2026-09-22 — Recipes and King Soopers list — and `SURFACE.md` still says one long
page, with this app as its worked example.** Joel asked; the TD reconciles the rule. Tabs are state,
not routes. The verb index is gone and **adding sits above the book, collapsed**. **Three ways in.**
**Nothing a model wrote is saved until Keep it; the typed path saves straight away**, which makes
the charter's "all three land as a draft" false — also the TD's.

**Three tables, all in `cookbook`**, reasoning in the migration headers. `recipes` stores **the whole
pot** and derives the serving; `grocery_items` is this app's list; `brand_preferences` the third.
**`macro_source` has two values where Health's has three** — no `web`, so a lifted number is not
storable rather than merely not written. **A duplicate name or phrase is refused by an index.**

**The list is the cheap version and that is a decision, not a gap** — reconfirmed by Joel 2026-09-21.
Copied text or a King Soopers link; no credential, no OAuth, no `middleware.ts` change, and a
remembered brand changes the link, not that rule. **A substitution policy and delivery-vs-pickup are
Kroger account settings, not this app's.** Tidy is one Haiku call and `validateTidy` refuses a
proposal that drops or doubles a line. **Clear empties everything and asks first** — no undo.
**Logging what you ate is absent** — item 22, the TD's.

**`methodSteps` splits a method; the prompt asking for line breaks is the smaller half** — the
renderer always honoured newlines, so a prompt-only fix would have left the existing book as one
block. Markers only, never sentences; its tests are mostly what it refuses to split.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, no per-query override. Health's
  `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **A failed read must never render as an empty book or list.** Both read as "nothing here", the
  opposite of what happened. `LookupError` → 503, and the client leaves its state `null`.
- **"Invalid API key" here is Supabase, not Anthropic** — reading the book or the list calls no model
  at all. It cost a wrong turn once.
- **A page that could not be read is refused twice**, the second check being the one that matters: a
  page claimed as read with no ingredients is rejected. A slug alone invents a convincing chilli.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the project
  and the domain did not exist; **both already did**. The dashboard is the record, never a checklist.
- **`npm run lint` has no config here** — not in CI, and no app has one. Boilerplate, not a break.

## Next

**Next, agreed 2026-09-22, not started: recipe metadata.** `total_minutes`, `meal`, `mains`,
`cuisine`, `equipment`, `diet`, `tags`, and a 1–5 `rating` you set. Array columns on `recipes`,
additive, migration rides with its code. **No allergen or gluten-free flags** — a wrong macro is a
wrong number, a wrong allergen claim is not. Macro-derived filters are **computed, never tagged**.
Existing rows need a **deliberate batched backfill**. The lean pill is built to take rating, time,
meal, main and cuisine and shows none yet. **Then photo-to-recipe**: recipe only, refuse rather than
guess, don't store the image, same estimate step.

**Waiting on Joel:** the receipt-derived seed, a decision on those four, **the produce section of
his 2026-09-21 rules** (parked on his own thinking — not a question to re-ask), and the dietary
pick-list, which lives in the tracker and so is the TD's contract to design first.
**The re-estimate guardrail stands — he considered dropping it on 2026-09-22 and chose not to.**
**Nothing in the ledger is this area's.**

**Still the TD's:** the read contract (22) and the grocery-list move out of Health (23).
