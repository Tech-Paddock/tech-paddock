-- Health: drop the grocery list's table (TEC-91, part 2 of TEC-15).
--
-- The grocery list moved to the Cookbook, which has its own
-- `cookbook.grocery_items`: you shop from recipes, not from what you ate. Part 1
-- (TEC-23, #235) made Health's `/list` a redirect to the Cookbook's list and
-- removed every read and write of `health.grocery_items`; it has been live on
-- `tp-health` since 2026-09-26. This migration removes the table that code left
-- behind, with the enum the `health_grocery_items` migration created for its
-- `source` column and nothing else uses.
--
-- **Shape: destructive.** It drops a table and a type. It is the second pull
-- request of the split, so the code that stopped using them is already live and
-- nothing deployed can notice they are gone.
--
-- Checked read-only before it was written, on 2026-09-26: the table held 0 rows,
-- no foreign key or view referenced it, and `health.grocery_source` was used by
-- `health.grocery_items.source` alone. No data is lost. `apps/health` names the
-- table only in a comment. Plain `drop`, not `cascade`, so anything that has
-- come to depend on either since then fails this migration rather than being
-- dropped with it.
--
-- No grant changes: nothing is created.

drop table health.grocery_items;

drop type health.grocery_source;

notify pgrst, 'reload schema';
