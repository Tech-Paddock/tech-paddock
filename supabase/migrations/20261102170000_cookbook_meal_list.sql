-- Cookbook · the meal list becomes Main · Side · Breakfast · Snack · Dessert · Creami (TEC-205)
--
-- Owner, 2026-11-02: "Let's use meal rather than course. So dinner and lunch are just mains etc.
-- Creami should get its own course." A recipe with no meal reads as Other in the app, which stays
-- null here: Other is not stored.
--
-- **Shape: widen, move the data, narrow. Data is changed, nothing is dropped.**
--
-- **The data move.**
--   * `dinner` and `lunch` become `main`.
--   * Every recipe whose `tags` contain `creami` becomes `creami`, whatever its meal was: the
--     dessert ones, and the ones with no meal. The tag is what marks a Creami recipe; a name that
--     merely contains "creami" does not move.
--   * Breakfast, snack, dessert, side and null are untouched.
--   The move is one-way: once `dinner` and `lunch` are `main` they cannot be told apart. Undo is a
--   restore, not a statement.
--
-- **The swap, without a long-held DROP.** The connector has timed out on DROP (supabase/README.md,
-- TD NOTES). The old check, `recipes_meal_check`, is a plain constraint and refuses `main` and
-- `creami`, so it has to go exactly once, and this is that once. Everything is arranged so that
-- the one DROP cannot hang:
--   1. `set local lock_timeout = '5s'` first: if the table is busy the statement fails fast and
--      the whole migration rolls back, rather than queueing behind a reader and blocking every
--      query behind it.
--   2. The new rule is a function, `cookbook.meal_ok`, as `lando.details_ok` is, and the new
--      constraint calls it. It is added before the data moves, so there is no window with no rule.
--   3. After this, the list is never a constraint swap again: widen or narrow it with
--      `create or replace function cookbook.meal_ok`, which takes no table lock.
-- Order: create the widened function, drop the old check, add the new one NOT VALID (no scan), move
-- the data, `create or replace` the function down to the final list, then VALIDATE (a scan that
-- blocks nothing but other DDL; `create or replace` does not re-check existing rows, so validating
-- is what proves the move left no `dinner` or `lunch`).
-- If the DROP still times out, nothing has changed (it rolled back): run this file once in the SQL
-- Editor inside `begin; … commit;` with the `schema_migrations` insert, as README.md describes.
--
-- Code and database: the code reads an old `dinner` or `lunch` from any model or request as `main`,
-- so it works against either side of this migration. Apply this first, then deploy the code.

set local lock_timeout = '5s';

-- 1. Widen: the old list plus the two new values, so the move below is legal at every step.
create or replace function cookbook.meal_ok(meal text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select meal is null or meal in (
    'breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'side', 'main', 'creami'
  )
$fn$;

alter table cookbook.recipes drop constraint recipes_meal_check;

alter table cookbook.recipes
  add constraint recipes_meal_ok check (cookbook.meal_ok(meal)) not valid;

-- 2. Move the data.
update cookbook.recipes
   set meal = 'creami'
 where 'creami' = any (tags) and meal is distinct from 'creami';

update cookbook.recipes
   set meal = 'main'
 where meal in ('dinner', 'lunch');

-- 3. Narrow to the final list.
create or replace function cookbook.meal_ok(meal text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select meal is null or meal in (
    'main', 'side', 'breakfast', 'snack', 'dessert', 'creami'
  )
$fn$;

alter table cookbook.recipes validate constraint recipes_meal_ok;

comment on column cookbook.recipes.meal is
  'Which meal it is: main, side, breakfast, snack, dessert or creami; null reads as Other. A closed list held by cookbook.meal_ok, so widening it is create or replace, not a constraint swap.';
