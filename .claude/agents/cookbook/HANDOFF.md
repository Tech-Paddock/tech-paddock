# Cookbook — handoff

State as of 2026-09-23.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**One pull request carries Joel's 2026-09-22 feedback round**, from `claude/cookbook-feedback-round`:
the icon, toasts, the collapse, Recipes boxed, list adding on top, and the file path. It replaces the
TD's #184 on his word. `-icon`, `-feedback-fixes` and `-from-a-file` are inside it, only to delete.

**Remembered brands are live and empty** — `brand_preferences`, RLS on, zero policies, **zero rows**;
its migration was **recorded under the version its filename declares**, unlike TEC-13's three.
**The seed has not arrived** — receipts read elsewhere, JSON into **Paste a batch**, validated row by
row, **no receipt reaching this app**; format in #165's body.

**Six things are pending on the TD** and reshape this area — Joel agreed tabs on 2026-09-22. They
went to Joel in that day's sign-off; filing them in Linear is the TD's, who owns the queue.

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
**Tab icon only, no home-screen icon** — the standup settled no install. **The icon is No. 12**, the
roundel on the car from above, Joel's pick on 2026-09-23 (artifact `8dHFRUnnZW4AJo9vem63HA`).
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
**Logging what you ate is absent** — TEC-11, the TD's to sequence.

**`methodSteps` splits a method on numbered markers only** — why, and what it refuses, is in its tests.

## Traps specific to this area

**Durable traps are in `DECISIONS.md`** — empty-vs-unread, the Supabase key, unconfigured `lint`.

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, no per-query override. Health's
  `/list` is live and **stays Health's** until TEC-15 lands; do not assume a date.
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
**In Linear under `agent:Cookbook`, filed and not started:** TEC-22 (the list's own URL) and TEC-24
(`GET /api/servings`) — our parts of TEC-15 and TEC-11, both waiting on Joel approving
`claude/brief-grocery-move`. The rest of TEC-11 and TEC-15 stays the TD's.
