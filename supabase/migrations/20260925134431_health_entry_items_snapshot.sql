-- Snapshot an item's numbers onto each logged line, with the version they came
-- from, so a past day's total never moves.
--
-- Settled by Joel on 2026-09-22, answering #116, and given the go on
-- 2026-09-24 (TEC-21). It reverses the 2026-09-18 design recorded in
-- `20260919135856_health_macro_tables.sql`, where `entry_items` referenced an
-- item's identity only and every read re-resolved the version for that day. A
-- correction then reached backwards through every day that ate the food.
-- Now a correction fixes the food from the next log onwards and never a day
-- already logged.
--
-- **Shape: additive.** Five nullable columns, one index, and one CHECK that
-- every existing row satisfies because every existing row has all five null.
-- `health.entry_items` held 0 rows on 2026-09-25 (pg_stat_user_tables), so
-- nothing is backfilled. The code still running when this is applied never
-- names these columns, so it keeps working; the code that writes them reads a
-- line with them null by resolving its version, so it tolerates any row the old
-- code writes in the gap between apply and deploy.
--
-- **A follow-up makes them NOT NULL** once the writing code is live and every
-- row carries a snapshot (TEC-21's last step). That is a separate pull request
-- because tightening a column is only safe after the code that fills it ships.
--
-- ## Why the version id as well as the numbers
--
-- The numbers alone would make every day logged before a correction wrong
-- permanently, with no way to find which days those are. With the version id a
-- backfill stays possible: `item_versions.kind` is what it reads to tell a day
-- that was wrong (`correction` — the number was always wrong) from one that was
-- right at the time (`change` — the food changed later). Nothing recomputes
-- automatically; that stays a deliberate step.
--
-- ## RLS
--
-- Columns on an existing table: RLS is already enabled on it with zero
-- policies, and nothing here changes that.

alter table health.entry_items
  add column item_version_id uuid references health.item_versions (id),
  add column kcal            numeric(8,2) check (kcal >= 0),
  add column protein_g       numeric(7,2) check (protein_g >= 0),
  add column carbs_g         numeric(7,2) check (carbs_g >= 0),
  add column fat_g           numeric(7,2) check (fat_g >= 0),
  -- All or nothing: a line carries a whole snapshot and the version it came
  -- from, or none of it. A half-written snapshot would sum as a real number.
  add constraint entry_items_snapshot_whole check (
    (item_version_id is null and kcal is null and protein_g is null and carbs_g is null and fat_g is null)
    or
    (item_version_id is not null and kcal is not null and protein_g is not null and carbs_g is not null and fat_g is not null)
  );

-- What a backfill joins on, and what the foreign key checks on every delete of
-- a version.
create index entry_items_item_version_idx on health.entry_items (item_version_id);

comment on column health.entry_items.item_version_id is
  'The item_versions row whose numbers were snapshotted onto this line when it was logged. Kept so a backfill can find the days a later correction would have changed; nothing recomputes from it automatically.';
comment on column health.entry_items.kcal is
  'Calories for ONE of the item, copied from item_version_id at log time. A day''s total is the plain sum of these times quantity; a later correction to the item does not move it.';
comment on column health.entry_items.protein_g is
  'Protein for one of the item, snapshotted at log time. See kcal.';
comment on column health.entry_items.carbs_g is
  'Carbohydrate for one of the item, snapshotted at log time. See kcal.';
comment on column health.entry_items.fat_g is
  'Fat for one of the item, snapshotted at log time. See kcal.';

notify pgrst, 'reload schema';
