-- Cookbook · Drop the unused recipe_tidy_drafts table
--
-- Requested 2026-11-02 (TEC-209): "209 approved deployment all". The second half of
-- TEC-207's destructive change: TEC-207 stopped the code using the table, this drops it.
--
-- **Shape: destructive.** Drops `cookbook.recipe_tidy_drafts` (TEC-201). It held 0 rows
-- when checked read-only on 2026-11-02. Its primary key, its foreign key to
-- `cookbook.recipes`, RLS (zero policies) and comments go with it. No function, trigger,
-- policy or index was created for it. Nothing reads or writes it.
--
-- Deployment: read the row count back first; if it is not 0, stop and report. A DROP has
-- timed out through the connector, so `lock_timeout` fails fast if the table is busy.
-- If it still times out, read back whether the table is gone before any retry
-- (`supabase/README.md`, Applying a migration).
--
-- Undo: none for data (there was none). The shape is in
-- `20261102012734_cookbook_recipe_tidy_drafts`.
--
-- Also refreshes the comment on `cookbook.recipes.house_style_at`, which still said a
-- Tidy is kept. The column stays: it marks a recipe put in the house style.

set local lock_timeout = '5s';

drop table cookbook.recipe_tidy_drafts;

comment on column cookbook.recipes.house_style_at is
  'When the recipe was put in the house style (kept from a way in that applied it; a Tidy kept before TEC-207 also set it). Null: not house-styled. Revert sets it null.';

notify pgrst, 'reload schema';
