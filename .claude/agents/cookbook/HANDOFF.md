# Cookbook — handoff

State as of 2026-09-22.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**Three branches, stacked, from Joel's 2026-09-22 feedback:** `claude/cookbook-icon` (the race
roundel, tab icon only), `-feedback-fixes` on it (toasts, the collapse, Recipes boxed, list adding on
top), `-from-a-file` on that. **Merge in that order.** Everything before them is live, as #175.

**Remembered brands are live and empty** — `brand_preferences`, RLS on, zero policies, **zero rows**;
its migration was **recorded under the version its filename declares**, unlike the three in item 26.
**The seed has not arrived** — receipts read elsewhere, JSON into **Paste a batch**, validated row by
row, **no receipt reaching this app**; format in #165's body.

**Six things are pending on the TD** and reshape this area — Joel agreed tabs on 2026-09-22. They
belong in the ledger, which only the TD writes, and went to Joel in that day's sign-off.

**Four brand-panel gaps, named by Joel 2026-09-20, not built** — his call, his order: nothing
**exports** the table; **import writes on trust** (shape is checkable, judgement is not — `brand:
Fairlife` with `terms: horizon organic` is well-formed and wrong); the panel **hides `note`**; a
brand needs **a line already on the list**. The first two matter most before a forty-row seed lands.

## What is true now

**Two tabs since 2026-09-22 — Recipes and King Soopers list — and `SURFACE.md` still says one long
page, with this app as its worked example.** Joel asked; the TD reconciles the rule. Tabs are state,
not routes. **Adding sits on top of both tabs**, collapsed on Recipes. **Four ways in once
`-from-a-file` lands** — a photo or PDF, read then priced, **never stored**, `imported` with no
`source_url`, refused twice when illegible like a link. **Nothing a model wrote is saved until
Keep it; the typed path saves straight away**, so the charter's "all three land as a draft" is
false twice over now — the TD's. **Results are toasts** (`app/Toast.tsx`); a failed read stays inline.
**Tab icon only, no home-screen icon** — the standup settled no install. **The icon is Joel's pick
between Nos. 11 and 12** (artifact `8dHFRUnnZW4AJo9vem63HA`); the branch holds No. 7 until he says.
**Its colours are exact and fixed, dark mode included** — his words: "it's perfect". No dark variant.

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

**`methodSteps` splits a method on numbered markers only** — why, and what it refuses, is in its tests.

## Traps specific to this area

**The durable ones moved to `DECISIONS.md`'s Traps section on 2026-09-22** — empty-vs-unread, the
Supabase key, and `lint` having no config anywhere. That file is append-only, is not rationed the
way this one is, and is where traps were always meant to live. What is left is tied to live state.

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, no per-query override. Health's
  `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **A page that could not be read is refused twice** — `RULES.md` has it in full, including why.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the project
  and the domain did not exist; **both already did**. The dashboard is the record, never a checklist.

## Next

**Next, agreed 2026-09-22, not started: recipe metadata.** `total_minutes`, `meal`, `mains`,
`cuisine`, `equipment`, `diet`, `tags`, and a 1–5 `rating` you set. Array columns on `recipes`,
additive, migration rides with its code. **No allergen or gluten-free flags** — a wrong macro is a
wrong number, a wrong allergen claim is not. Macro-derived filters are **computed, never tagged**.
Existing rows need a **deliberate batched backfill**. The lean pill is built to take rating, time,
meal, main and cuisine and shows none yet. Photo-to-recipe, once after this, jumped the queue.

**Waiting on Joel:** the receipt-derived seed, a decision on those four, **the produce section of
his 2026-09-21 rules** (parked on his own thinking — not a question to re-ask), and the dietary
pick-list, which lives in the tracker and so is the TD's contract to design first.
**The re-estimate guardrail stands — he considered dropping it on 2026-09-22 and chose not to.**
**Nothing in the ledger is this area's. Still the TD's:** the read contract (22), the list move (23).
