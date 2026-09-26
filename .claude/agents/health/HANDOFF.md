# Health — handoff

State as of 2026-09-26. Read `RULES.md`, then the Linear document "Health — plan" (team TEC) before
changing a feature. Open work is the Linear issues labelled `agent:Health`, nothing here.

---

## The macro log is live

Dictate what you ate, approve the draft, it is logged with the day's running total; `/debug` runs
both models on one food and keeps every run. **`health.entry_items` held one row on 2026-09-26**,
fully snapshotted; the harness has not been run.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. A Cookbook recipe first (below),
then exact match on the normalised name; a miss goes outside to one model call; approval writes it
back, so outside runs once per food ever.

**Item numbers are append-only.** `health.items` is identity, `health.item_versions` is what it
weighed over time, nothing updated in place. `lib/items.ts:resolveVersion` picks the version for a
date: the era with the greatest `effective_from` on or before it, then the newest row in that era.

**Each logged line snapshots its numbers** (TEC-21, the `health_entry_items_snapshot` migration,
made NOT NULL by `health_entry_items_snapshot_not_null`): `entry_items` carries the four macros and
the `item_version_id` they were copied from. `readDay` is a plain sum and reads no version; a line
without a snapshot is a `LookupError`, never a zero. So **a correction fixes the food from the
next log on and never moves a day already logged** — including the line you opened it from.
`resolveVersion` runs only at log time.
**`kind` keeps a job**: it is what a backfill would read to tell a day that was wrong (`correction`)
from one that was right at the time (`change`). No backfill exists; it would be a deliberate step.

**The dates are the phone's, always sent** — no route falls back to UTC — and the page re-reads
"today" when it comes back into view and at every parse. **"From the web" is checked, not
claimed.** `lib/webEvidence.ts` keeps a cited URL only when that run's own
`web_search` / `web_fetch` results contain it; otherwise the number is an estimate.

**`/debug` judges each model against your stored number** (`lib/harness.ts`), not only against the
other, and stores both pairs on the run (the `health_comparisons_pairs_and_pick_time`
migration). It asks for a pick only on a real disagreement; a failed side is named,
never a match. **A pick is one-shot**: claimed on the row
first, numbers read from the stored run rather than the request, time recorded.

**Approving decides every line before writing anything** — `lib/approve.ts:decideLine`, tested.
A number is `hand` only when the line says it was typed over; a difference nobody typed, a line
whose `item_id` no longer matches its name, a failed line or a food on the draft twice is a 409
and nothing is written. **A renamed draft line is cleared and looked up again** through
`/api/resolve` when the field loses focus; approve waits until every line has numbers. Same-name
lines from one dictation merge, quantities added, before anything is estimated.

## Cookbook: the list has moved, recipes are read from it

**`/list` only redirects** to `https://cookbook.techpaddock.io/list` (TEC-23). `health` has no grocery
table: `health_drop_grocery_items` dropped it and its enum (TEC-91, 0 rows); the list is Cookbook's.

**A food whose normalised name equals a Cookbook recipe's is the Cookbook's** (TEC-25, Joel
2026-09-26). `lib/cookbook.ts` reads `GET /api/servings` once per request, forwarding **only**
`paddock_session` to the origin of `COOKBOOK_BASE_URL`; the numbers carry `source = cookbook` and no
model. The recipe is an ordinary `health.items` row; approving re-reads the Cookbook, refuses a
draft whose numbers moved, and appends a `cookbook` version (kind `change`) only when they differ
from the current one. **A typed-over recipe number is refused** — on the draft, in a day-log
correction and in a `/debug` pick — "Fix it in the Cookbook", because the next log bypasses it.
Recipes that share a normalised name are refused on the line, never guessed between.

## Traps specific to this seat

- **An unreadable Cookbook fails only lines that could be a recipe** (Joel, 2026-09-26): a name
  stored with a `cookbook` version gets "Couldn't reach the Cookbook"; others resolve as normal, so
  **a recipe never yet logged here falls through** (the accepted gap). A `SESSION_SECRET` mismatch
  looks exactly like an outage.
- **`normalizeName` is the item key.** It folds accents, apostrophes and simple plurals ("Large
  Fries" meets "Large Fry"). Changing it once `health.items` has rows splits one food into two
  keys, so a change then needs a migration that re-keys the table, not only a code edit. It is
  also what decides a name is a Cookbook recipe.
- **`lib/models.ts` is Coffee's registry duplicated and flagged, not a verbatim copy** — the two
  have diverged. Do not let a third copy happen quietly.
- **The livery is borrowed and has a collision.** `senna`, which the parked tracker also wears, maps
  `--sev-warn` onto the accent, so "over target" and "on track" are one colour. TechPad Gen's.
- **`eaten_at` is not the time you ate.** The app never sets it, so it duplicates `created_at`;
  `eaten_on` is what a day's total reads. Both carry column comments.
