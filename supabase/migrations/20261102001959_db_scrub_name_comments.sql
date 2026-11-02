-- Reword four live COMMENT ON texts so they no longer name a person (TEC-170).
-- The meaning is unchanged. The earlier statements stay in their files as the
-- record of what ran; these supersede them in the database. Additive: comments
-- only, no table, column, constraint or data changes.

comment on column cookbook.recipes.rating is
  '1–5, set by the owner. No model writes it, the backfill included.';

comment on column cookbook.menu.day is
  'The day the owner means to cook it. Picked when the ingredients go to the list, changeable from the menu. Defaults to today in Denver for a row written without one.';

comment on table cookbook.menu is
  'On the menu: the recipes sent to the list, one row each, with the day each is planned for. Nothing removes a row but the owner, one at a time or all at once.';

comment on table cookbook.brand_products is
  'What Kroger last said about each exact-product brand at the chosen store. Written only by a refresh; the brand row beside it stays the owner''s choice. A product Kroger stopped returning is flagged by missing_since and kept, never dropped.';

notify pgrst, 'reload schema';
