# Health — charter

`NOTES.md` is the app's state and traps. The reasoning behind these rules is the Linear document
"Health — plan" (team TEC, https://linear.app/tech-paddock/document/health-plan-c504dc02830d). Read
it before designing or changing a feature; it is not this app's to redo. Where the two disagree,
this file wins.

## Scope

- Record what was eaten; return its macros and the day's running total.
- Food only. Exercise is out.
- Recipes and the grocery list belong to the Cookbook. Health reads recipes to price a meal and
  owns neither.
- Recipes are read only through Cookbook's `GET /api/servings`, called from the server with the
  caller's session; never from `cookbook` tables. The contract lives in Cookbook's charter and
  changes only through the technical director.

## Surface: app

- One screen. A second needs a written reason and the owner's approval; it must be the same nouns
  one step earlier or later, not new territory.
- No index or tabs. Secondary views are a quiet footer link.
- Thumb-first: the primary action sits in the reachable half; assume one hand.
- Opens in its working state, not a menu.
- Home-screen install is part of the design. On iOS it is done from Safari.
- `/admin` and `/debug` never appear in navigation and do not count as screens.
- The log is the screen. A second earns its place by being a different moment, not a different
  noun.

## Never

1. Write without approval. Approving is the only write.
2. Let a failed lookup look like "not found". A database error surfaces and never falls through
   to the web; otherwise nothing on screen changes and the numbers drift.
3. Replace a hand-entered number without keeping the old one. Hand corrections are the only
   ground truth.
4. Put real food-log data in the repo. Fixtures are invented food.
5. Read or write another tool's schema. `lib/supabase.ts` pins `health`; never override it per
   query.
6. Estimate when the table already knows. Bypassing the table is a deliberate tap, never a
   default.

Rules 2 and 6 are one rule: the database is read before anything external, because a web result
would overwrite a hand correction. This is correctness, not cost.

## Lookup order

- A line naming a Cookbook recipe asks the Cookbook first. Its numbers are never typed over here,
  on a draft, a correction or `/debug`; the fix belongs in the Cookbook.
- Everything else:
  1. Exact match in the `health` table.
  2. Near match on the normalised item name.
  3. Miss: web search for branded items, a model estimate otherwise.
  4. Approval writes the result back, so step 3 runs once per food.

## Items and corrections

- A row is what was ordered, not its components: a combo meal is one row, a combo and a cookie are
  two.
- The item name carries the whole specification ("large fry" and "medium fry" are two items). No
  components, modifiers or per-instance overrides.
- A correction fixes the item, never a past day. Item numbers are append-only versions.
- An entry snapshots the item's numbers, item id and version when logged, so a past day's total
  never moves.

## Models

- A registry, not two strings, following `apps/coffee/lib/models.ts`. Health's copy is its own.
  Models differ in accepted parameters and web tool versions, so a bare swap is an error.
- Haiku 4.5 is the default; Sonnet 5 is available. No effort dial.
- Only the judgment call (the estimate) gets a model choice. The parse is pinned.
- Every number carries its provenance: log, web or estimate, and the model that produced it.
  Cookbook numbers carry `cookbook` and no model.

## Settled

- No `/api/summary`. Nothing reads one.
- The livery is the theme's (`apps/home`). `lib/livery.ts` pins `senna`. Do not change it from here.
- The `health` schema and its tables belong to this app.

## Traps

- A new route needs no edit to the gate file: its matcher is a catch-all negative. The debug
  surface must never need the gate file.
- The Supabase exposed-schemas list is outside the repo. A missing schema fails as a permissions
  error that reads like a bad key; `/api/health` probes for it.
