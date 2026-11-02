-- Cookbook · a recipe can be saved before its macros are estimated
--
-- Agreed with Joel on 2026-11-01 (TEC-200): "Don't worry about finding any
-- macros yet. Just add them to my database." The Recipe Keeper export holds
-- recipes with no numbers, and estimating each on import was the other option;
-- the owner chose save now, macros later. The code that reads this is
-- `lib/recipes.ts` (`hydrate`, `toServingRows`) and `lib/recipeSteps.ts`
-- (`isEstimated`).
--
-- Shape: **additive.** Nothing is dropped and no row changes. Four `not null`s
-- and one enum column are relaxed, one constraint is replaced by a wider one
-- (every existing row already satisfies it), one constraint and one column are
-- added. The database sitting ahead of the code is harmless: until the code
-- ships, every row still has macros, and the old code still reads them. So this
-- lands before the code that writes a recipe without them.
--
-- ## "Not estimated yet" is a state, never a zero
--
-- `kcal`, `protein_g`, `carbs_g`, `fat_g` and `source` become nullable
-- **together**: all five set, or all five null. A recipe with a calorie count and
-- no protein is not a state anything can show, so `recipe_macros_together` makes
-- it unstorable. A zero stays what it always was, a real figure (water).
--
-- When they are null, `model` is null too. A model name beside no numbers would
-- say a model priced a recipe it never priced. `recipe_model_matches_source` is
-- the same rule as before with the new case added: no source means no model;
-- `hand` means no model; an estimate has to name its model.
--
-- Health is untouched. `GET /api/servings` leaves an unestimated recipe out
-- (`toServingRows`), so the contract keeps its shape and no reader sees a null.
--
-- ## imported_original
--
-- What the recipe looked like exactly as imported: ingredients, directions,
-- yield text and source text. **Written once, at load, and never rewritten**
-- (the trigger below refuses to change or clear it once set). TEC-201's Tidy
-- reads it, and its Revert restores from it; if Tidy could overwrite it, Revert
-- would restore the tidied text. Null on every recipe that was not imported.
-- It must be a JSON object, so a reader never has to guess the shape of a scalar.

alter table cookbook.recipes alter column kcal      drop not null;
alter table cookbook.recipes alter column protein_g drop not null;
alter table cookbook.recipes alter column carbs_g   drop not null;
alter table cookbook.recipes alter column fat_g     drop not null;
alter table cookbook.recipes alter column source    drop not null;

alter table cookbook.recipes
  add constraint recipe_macros_together check (
    (kcal is null and protein_g is null and carbs_g is null and fat_g is null and source is null)
    or
    (kcal is not null and protein_g is not null and carbs_g is not null and fat_g is not null and source is not null)
  );

alter table cookbook.recipes drop constraint recipe_model_matches_source;
alter table cookbook.recipes
  add constraint recipe_model_matches_source check (
    (source is null and model is null)
    or (source = 'hand' and model is null)
    or (source = 'estimate' and model is not null)
  );

alter table cookbook.recipes add column imported_original jsonb;

alter table cookbook.recipes
  add constraint recipe_imported_original_is_object check (
    imported_original is null or jsonb_typeof(imported_original) = 'object'
  );

create function cookbook.recipe_imported_original_once() returns trigger
language plpgsql as $$
begin
  if old.imported_original is not null
     and new.imported_original is distinct from old.imported_original then
    raise exception 'cookbook.recipes.imported_original is written once and never rewritten';
  end if;
  return new;
end;
$$;

create trigger recipe_imported_original_once
  before update on cookbook.recipes
  for each row execute function cookbook.recipe_imported_original_once();

comment on column cookbook.recipes.kcal is
  'The whole pot, not a serving. Null (with the other three macros and source) until estimated; never 0 for "not yet".';
comment on column cookbook.recipes.protein_g is
  'The whole pot. Null together with kcal, carbs_g, fat_g and source.';
comment on column cookbook.recipes.carbs_g is
  'The whole pot. Null together with kcal, protein_g, fat_g and source.';
comment on column cookbook.recipes.fat_g is
  'The whole pot. Null together with kcal, protein_g, carbs_g and source.';
comment on column cookbook.recipes.source is
  'Where the macros came from: hand or estimate. Null exactly when the macros are (not estimated yet).';
comment on column cookbook.recipes.imported_original is
  'The recipe exactly as imported: ingredients, directions, yield text, source text (a JSON object). Written once at load, never rewritten; Tidy''s Revert restores from it (TEC-200, TEC-201).';

notify pgrst, 'reload schema';
