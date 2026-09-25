-- Cookbook · recipe names on list lines, and "On the menu"
--
-- Joel's asks of 2026-09-24, sections B and C of TEC-39. Reasoning here; the
-- code that reads it is `lib/grocery.ts` and `lib/menu.ts`.
--
-- Shape: **additive.** One column with a default every existing row already
-- satisfies, and one new table. Nothing existing is read or written differently
-- until the code that uses them ships, so the database sitting ahead of the
-- code is harmless and this rides with its code.
--
-- ## B. Which recipes a line came from — plain text, not a join
--
-- A line pushed from a recipe said only "from a recipe". It now says which:
-- `olive oil · Green bean almondine, Chicken thighs`. **Names, not ids, and no
-- join table** — Joel chose plain text because it is cheaper, and accepted what
-- that costs: the names are a snapshot, so renaming or removing a recipe does
-- not change a line already on the list. That is the same shape as the
-- ingredients themselves, which were copied as text rather than linked.
--
-- An array because Tidy merges lines: two recipes' olive oil becomes one line
-- that names both, unioned without duplicates. Typed lines have none. **Lines
-- already on the list keep `'{}'`** and go on saying "from a recipe" — nothing
-- here guesses which recipe an old line came from.
--
-- ## C. On the menu — what you are eating this week
--
-- Every recipe whose ingredients went to the list in the last seven days,
-- rolling from when it was added (Joel's pick over a calendar week). **One row
-- per recipe**: adding the same recipe again restarts its seven days by
-- updating `added_at`, rather than stacking a second row.
--
-- **It falls off by being read that way** — `added_at > now() - 7 days` in the
-- query. No cron and nothing deleted behind anyone's back; an old row is simply
-- not shown. ✕ on the menu deletes the row and nothing else: the ingredients
-- stay on the list and the recipe stays in the book. **Removing a recipe from
-- the book takes it off the menu** — the foreign key cascades, because a menu
-- entry for a recipe that no longer exists has nothing to show.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and this data. The server uses the service role.

alter table cookbook.grocery_items
  add column recipes text[] not null default '{}';

comment on column cookbook.grocery_items.recipes is
  'Names of the recipes this line came from, as they were when it was added. A snapshot: renaming or removing a recipe does not change it. Empty for a typed line, and for recipe lines added before 2026-09-25.';

create table cookbook.menu (
  recipe_id uuid primary key references cookbook.recipes (id) on delete cascade,
  added_at  timestamptz not null default now()
);

create index menu_added_idx on cookbook.menu (added_at desc);

alter table cookbook.menu enable row level security;

comment on table cookbook.menu is
  'On the menu: the recipes sent to the list, one row each. Shown for seven days from added_at; nothing deletes an old row, it is just not read.';

notify pgrst, 'reload schema';
