-- A fourth provenance for a number in `health`: `cookbook`, a recipe's macros
-- per serving as the Cookbook's `GET /api/servings` returned them.
--
-- Joel picked "Health's plan" on 2026-09-26 (TEC-25): a line naming a Cookbook
-- recipe asks the Cookbook before Health's own table, and the recipe is stored
-- as a `health.items` row with a version whose source is `cookbook` whenever
-- its numbers differ, so the snapshot and a backfill work unchanged.
--
-- **Shape: additive.** One new enum value. No existing row changes and no
-- existing value is renamed or removed; the code running when this is applied
-- never writes the new value, so it keeps working.
--
-- **This file adds the value and nothing else, on purpose.** Postgres refuses
-- to *use* an enum value in the transaction that added it ("unsafe use of new
-- value"), and each migration is applied in its own transaction. So the CHECK
-- that exempts `cookbook` from naming a model is the next migration,
-- `health_cookbook_needs_no_model`, and it must be applied after this one.
--
-- ## RLS
--
-- A type, not a table: nothing here touches RLS.

alter type health.macro_source add value if not exists 'cookbook';

notify pgrst, 'reload schema';
