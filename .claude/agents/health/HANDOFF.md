# Health — handoff

State as of 2026-09-29. Read `RULES.md`, then the Linear document "Health — plan" (team TEC) before
changing a feature. Open work is the Linear issues labelled `agent:Health`, nothing here.

---

## The macro log is live

Dictate what you ate, approve the draft, it is logged with the day's running total; `/debug` runs
both models on one food and keeps every run. **`health.entry_items` held one row on 2026-09-26**;
the harness has not been run, and no target had been set when TEC-53 shipped.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. A Cookbook recipe first (below),
then exact match on the normalised name; a miss goes outside to one model call; approval writes it
back, so outside runs once per food ever.

**Item numbers are append-only.** `health.items` is identity, `health.item_versions` is what it
weighed over time. `lib/items.ts:resolveVersion` picks the version for a date: the era with the
greatest `effective_from` on or before it, then the newest row in that era.

**Each logged line snapshots its numbers** (TEC-21): `entry_items` carries the four macros and the
`item_version_id` they came from, NOT NULL. `readDay` is a plain sum and reads no version; a line
without a snapshot is a `LookupError`, never a zero. So **a correction fixes the food from the next
log on and never moves a day already logged**. `kind` is what a backfill would read to tell a day
that was wrong (`correction`) from one right at the time (`change`); no backfill exists.

**The dates are the phone's, always sent**, and the page re-reads "today" when it comes back into
view and at every parse. **"From the web" is checked, not claimed**: `lib/webEvidence.ts` keeps a
cited URL only when that run's own search or fetch results contain it.

**`/debug` judges each model against your stored number** (`lib/harness.ts`) and stores both pairs
on the run. It asks for a pick only on a real disagreement; a failed side is named, never a match.
**A pick is one-shot**: claimed on the row first, numbers read from the stored run.

**Approving decides every line before writing anything** (`lib/approve.ts:decideLine`). A number is
`hand` only when the line says it was typed over; a difference nobody typed, a stale `item_id`, a
failed line or a food on the draft twice is a 409 and nothing is written. A renamed line is looked
up again through `/api/resolve` on blur; same-name lines from one dictation merge first.

## Targets, "Left today" and deleting a meal (TEC-53)

**`health.targets` is append-only and dated** (the `health_targets` migration): grams only, calories
derived as 4p + 4c + 9f, `locked` remembered. `lib/targets.ts:targetFor` picks the greatest
`effective_from` on or before the day, with **no fallback** — a day before any target has none. A
new target applies from the phone's today; the server refuses a date over a day from UTC's.
**Three states stay apart**: a target, none (`{ target: null }`), and a failed read (503, shown as an
error on the card and on `/targets`, which then offers no form). "Left today" is signed; the clamp
at zero is the `/targets` split's (`setCalories`, `setMacro`), not the remainder's.
**Deleting a meal** (`lib/entries.ts`) deletes the `entries` row; its lines go by cascade and the
items and versions stay. **None of it calls a model**; `tests/targets.test.ts` walks the imports.

## Cookbook: the list has moved, recipes are read from it

**`/list` only redirects** to `https://cookbook.techpaddock.io/list` (TEC-23). `health` has no grocery
table: `health_drop_grocery_items` dropped it and its enum (TEC-91, 0 rows); the list is Cookbook's.

**A food whose normalised name equals a Cookbook recipe's is the Cookbook's** (TEC-25).
`lib/cookbook.ts` reads `GET /api/servings` once per request, forwarding **only** `paddock_session`
to `COOKBOOK_BASE_URL`; the numbers carry `source = cookbook` and no model. Approving re-reads the
Cookbook, refuses a draft whose numbers moved, and appends a `cookbook` version (kind `change`) only
when they differ. **A typed-over recipe number is refused** everywhere — "Fix it in the Cookbook".
Recipes that share a normalised name are refused on the line, never guessed between.

## Traps specific to this seat

- **An unreadable Cookbook fails only lines that could be a recipe**: a name stored with a
  `cookbook` version gets "Couldn't reach the Cookbook"; a recipe never yet logged here falls
  through (the accepted gap). A `SESSION_SECRET` mismatch looks exactly like an outage.
- **`normalizeName` is the item key**, folding accents, apostrophes and simple plurals. Changing it
  once `health.items` has rows splits one food into two keys and needs a re-keying migration.
- **`lib/models.ts` is Coffee's registry duplicated and flagged, not a verbatim copy** — the two
  have diverged. Do not let a third copy happen quietly.
- **The livery is borrowed** (`senna`, shared with the parked tracker). Separately, **every** livery
  maps `--sev-warn` onto the accent, so "over" and "on track" match; `--danger` differs. TechPad Gen's.
  **Over target uses `--danger` locally** (`app/LeftToday.tsx`), flagged for TechPad Gen (TEC-12).
- **`eaten_at` is not the time you ate.** The app never sets it, so it duplicates `created_at`;
  `eaten_on` is what a day's total reads. Both carry column comments.
