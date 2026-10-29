-- Cookbook · prep and cook minutes on a recipe (TEC-189)
--
-- Agreed with the owner on 2026-10-29. Reasoning here; the code that reads and
-- writes it is `lib/metadata.ts` (`readMeta`, `timeMinutes`, `timeParts`) and
-- `lib/recipes.ts`.
--
-- Shape: **additive.** Two new nullable columns on `cookbook.recipes`, same
-- bounds as `total_minutes` (more than 0, at most 2880, which is two days; past
-- that the number is a typo, not a recipe). Every existing row already
-- satisfies both checks, since both read null. Nothing existing is read or
-- written differently until the code that uses them ships, so the database
-- sitting ahead of the code is harmless, and this rides with its code.
--
-- ## What these are for
--
-- The recipe list shows "Prep 15m · Cook 30m" instead of one total, and the
-- "Under N minutes" filter sums them. All four ways in (Ask Claude, link, file,
-- typed) fill them through the existing metadata path, and Edit has two fields.
--
-- ## `total_minutes` stays
--
-- **It is not dropped.** The recipes already in the book hold it and nothing
-- here converts it: it shows only while neither prep nor cook is set, and the
-- time filter uses prep plus cook, falling back to it. A later change can retire
-- it as its own pull request once nothing reads it.
--
-- ## Existing rows
--
-- Both columns read null until someone fills them. Nothing in this file writes a
-- row. `GET /api/servings` (the Health contract) does not select either column
-- and is unchanged.
--
-- ## RLS
--
-- No new table. `cookbook.recipes` already has RLS enabled with zero policies.

alter table cookbook.recipes
  add column prep_minutes integer
    check (prep_minutes is null or (prep_minutes > 0 and prep_minutes <= 2880)),
  add column cook_minutes integer
    check (cook_minutes is null or (cook_minutes > 0 and cook_minutes <= 2880));

comment on column cookbook.recipes.prep_minutes is
  'Hands-on time before it cooks, in minutes. Null when nobody has said. Shown with cook_minutes; total_minutes shows only when both are null (TEC-189).';
comment on column cookbook.recipes.cook_minutes is
  'Time it spends cooking, oven and resting included, in minutes. Null when nobody has said (TEC-189).';

notify pgrst, 'reload schema';
