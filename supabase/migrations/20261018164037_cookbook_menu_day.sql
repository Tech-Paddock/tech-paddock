-- Cookbook · On the menu gets a day
--
-- Joel, 2026-10-05: adding a recipe to the list put it on the menu "today" with
-- no say in it. He plans the week, so a menu entry now carries **the day he
-- means to cook it**, picked when the ingredients go to the list and changeable
-- from the menu afterwards. The code that reads it is `lib/menu.ts`.
--
-- Shape: **additive.** One column. Existing rows are filled from the day they
-- were added, and the default means the code already live — which inserts no
-- day — goes on working against this table until the new code ships. So the
-- database sitting ahead of the code is harmless and this rides with its code.
--
-- ## Still one row per recipe
--
-- Joel was asked whether a recipe could sit on two days and said no: he is not
-- meal-prepping, and does not cook the same thing twice in a week. So
-- `recipe_id` stays the primary key, and adding a recipe already on the menu
-- moves it to the new day rather than listing it twice.
--
-- ## Nothing falls off by itself any more
--
-- The seven rolling days are gone, by Joel's choice: **he clears the menu
-- himself**, all at once or one row at a time. `added_at` stays, unread by the
-- menu, as the record of when a row was last written. A row older than seven
-- days that the old code had stopped showing is shown again until he clears it.
--
-- ## The time zone
--
-- A date has no time zone, so one is chosen for the two places the database has
-- to turn a moment into a day: the backfill below, and the default. Denver, where
-- the King Soopers is. The app sends the day the browser picked, so this only
-- decides rows written without one.

alter table cookbook.menu add column day date;

update cookbook.menu
  set day = (added_at at time zone 'America/Denver')::date
  where day is null;

alter table cookbook.menu
  alter column day set default ((now() at time zone 'America/Denver')::date),
  alter column day set not null;

create index menu_day_idx on cookbook.menu (day);

comment on column cookbook.menu.day is
  'The day Joel means to cook it. Picked when the ingredients go to the list, changeable from the menu. Defaults to today in Denver for a row written without one.';

comment on table cookbook.menu is
  'On the menu: the recipes sent to the list, one row each, with the day each is planned for. Nothing removes a row but Joel, one at a time or all at once.';

notify pgrst, 'reload schema';
