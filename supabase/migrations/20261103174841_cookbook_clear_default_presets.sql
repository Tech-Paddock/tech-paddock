-- Cookbook · clear every default preset (TEC-214)
--
-- Owner, 2026-11-02: "Leave it but clear it. I want the functionality but I don't want the
-- presets." Make default in Your brands stays, by hand; nothing sets a default automatically any
-- more, and picking now goes default, then the pack that fits the amount, then the most purchased.
-- The presets already saved are the ones the old Make default on Send wrote, so they go.
--
-- **Shape: a data change. An UPDATE of existing rows; no column, table or schema changes, and
-- nothing is dropped or deleted. It clears presets and is not undoable:** the names a product was
-- the default for are not kept anywhere else. Owner-approved ("Leave it but clear it").
--
-- **Deployment reads back, before and after, the count of products with a non-empty
-- `default_for`:**
--   select count(*) from cookbook.products where cardinality(default_for) > 0;
-- Before: the number of presets being cleared. After: 0.
--
-- It can land before or after the code that stops writing defaults. Before: until the deploy, the
-- old Make default on Send can write one back, and the old pick honours it. After: a preset is
-- cleared by the first deploy anyway. Either order ends with none, once both are live.

update cookbook.products
   set default_for = '{}'
 where cardinality(default_for) > 0;
