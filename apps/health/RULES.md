# Health — rules

`NOTES.md` is the app's state and traps. The reasoning behind these rules is the Linear document
"Health — plan" (team TEC, https://linear.app/tech-paddock/document/health-plan-c504dc02830d). Read
it before designing or changing a feature. Where the two disagree, this file wins.

## Scope

- Record what was eaten; return its macros and the day's running total.
- Food only. Exercise is out.
- Recipes and the grocery list belong to the Cookbook. Health reads recipes to price a meal and
  owns neither.
- Recipes are read only through Cookbook's `GET /api/servings`, called from the server with the
  caller's session; never from `cookbook` tables. The contract lives in Cookbook's RULES.md,
  Health↔Cookbook contract, and changes only through the technical director.

## Surface: app

- The log, plus `/targets` (TEC-53), reached from the footer and from Left today. Another screen
  needs a written reason and the owner's approval; it must be the same nouns one step earlier or
  later, not new territory. `/list` only redirects to Cookbook's list.
- No index or tabs. Secondary views are a quiet footer link.
- Thumb-first: the primary action sits in the reachable half; assume one hand.
- Opens in its working state, not a menu.
- Home-screen install is part of the design. On iOS it is done from Safari.
- The log is the app. Another screen earns its place by being a different moment, not a different
  noun.

## Never

1. Write what a lookup or the model produced before it is approved. Deleting a meal
   (`DELETE /api/entries/[id]`), a hand correction (`POST /api/items/version`) and a target
   (`POST /api/targets`) are deliberate taps that write directly.
2. Let a failed lookup look like "not found". A database error surfaces and never falls through
   to the web; otherwise nothing on screen changes and the numbers drift.
3. Replace a hand-entered number without keeping the old one. Hand corrections are the only
   ground truth.
4. Put real food-log data in the repo. Fixtures are invented food.
5. Read or write another tool's schema. `lib/supabase.ts` pins `health`; never override it per
   query.
6. Estimate when the table already knows.

Rules 2 and 6 are one rule: the database is read before anything external, because a web result
would overwrite a hand correction. This is correctness, not cost.

## Lookup order

- A line naming a Cookbook recipe asks the Cookbook first. Its numbers are never typed over here,
  on a draft or a correction; the fix belongs in the Cookbook.
- Everything else:
  1. Exact match in the `health` table on the normalised name (case, accents, punctuation, number
     words, simple plurals), never a fuzzy match.
  2. Miss: one model call (`lib/anthropic.ts`), which may search the web for a branded food and
     otherwise estimates.
  3. Approval writes the result back, so step 2 runs once per food.

## Items and corrections

- A row is what was ordered, not its components: a combo meal is one row, a combo and a cookie are
  two.
- The item name carries the whole specification ("large fry" and "medium fry" are two items). No
  components, modifiers or per-instance overrides.
- A correction fixes the item, never a past day. Item numbers are append-only versions.
- An entry snapshots the item's numbers, item id and version when logged, so a past day's total
  never moves.

## Models

- One model, Claude Sonnet 5.5 at effort medium, set in `lib/models.ts`. No picker, no effort
  dial, no comparison.
- A registry entry, not a bare string. Health's copy is its own. Models differ in accepted
  parameters and web tool versions, so a bare swap is an error.
- Every number carries its provenance, `hand`, `web`, `estimate` or `cookbook` (`lib/macros.ts`;
  "Your log" is only the label for `hand`), and the model that produced it. `hand` and `cookbook`
  name no model.

## Settled

- No `/api/summary`. Nothing reads one.
- The livery is the theme's (`apps/home`). `lib/livery.ts` pins `senna`. Do not change it from here.
- The `health` schema and its tables belong to this app.
- Deleting a meal is the one rewrite of the log. The owner decided on 2026-10-26 that it becomes a
  soft delete, hidden and kept; TEC-165 makes it one.
- One exception to Never 2, accepted by the owner on 2026-09-26 (TEC-25): during a Cookbook
  outage, a recipe never yet logged here cannot be told from a food, so it resolves as an ordinary
  food and may reach the model (`lib/cookbook.ts`, "The accepted gap"). A recipe stored with a
  `cookbook` version still fails its line.

## Traps

- A new route needs no edit to the gate file: its matcher is a catch-all negative.
- The Supabase exposed-schemas list is outside the repo. A missing schema fails as a permissions
  error that reads like a bad key; `/api/health` probes for it.
