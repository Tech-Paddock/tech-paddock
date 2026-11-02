-- Cookbook · Tidy drafts, and a mark for "in the house style"
--
-- Requested 2026-11-01 (TEC-201): "Normalize recipes so they all have the same read
-- feel ... I want to see 1 cup onion in the ingredients and the instructions to chop
-- it in the instructions." Tidy writes one DRAFT per recipe; a person keeps it from
-- the review screen. The drafts live in the database so the review survives a reload.
-- The code that reads this is `lib/tidyStore.ts` and `lib/tidy.ts`.
--
-- Shape: **additive.** One new table, one new nullable column. Nothing is dropped,
-- no row changes. The database sitting ahead of the code is harmless: nothing reads
-- either until the code ships.
--
-- ## recipe_tidy_drafts
--
-- One row per recipe at most (the primary key), so a second Tidy of the same recipe
-- replaces the first. It holds only what Tidy proposes: the ingredients, the method,
-- and the servings. **A draft never changes a recipe.** The recipe changes only when
-- a draft is kept, and keeping deletes the draft. The name is never in a draft, so a
-- Tidy cannot rename a recipe. The "before" the review shows is not stored here: it
-- is read from `recipes.imported_original` when set, else from the recipe, at the
-- time the screen is drawn.
--
-- `servings_estimated` is true only where the imported yield text gave no count and
-- Tidy estimated one; the review marks those and lets them be edited.
--
-- Deleting a recipe deletes its draft (the foreign key cascades).
--
-- ## recipes.house_style_at
--
-- When the recipe was last put in the house style: set when a Tidy is kept and when a
-- recipe is kept from a way in that applied it. Null means "not tidied yet", which is
-- what decides which recipes Tidy offers. A Revert sets it back to null.

create table cookbook.recipe_tidy_drafts (
  recipe_id          uuid primary key references cookbook.recipes (id) on delete cascade,
  ingredients        text[] not null check (cardinality(ingredients) > 0),
  method             text,
  servings           integer not null check (servings >= 1 and servings <= 99),
  servings_estimated boolean not null default false,
  created_at         timestamptz not null default now()
);

alter table cookbook.recipe_tidy_drafts enable row level security;

alter table cookbook.recipes add column house_style_at timestamptz;

comment on table cookbook.recipe_tidy_drafts is
  'A proposed house-style version of one recipe (TEC-201): ingredients, method, servings. Never changes the recipe until kept; keeping deletes it. At most one per recipe.';
comment on column cookbook.recipe_tidy_drafts.servings_estimated is
  'True when the imported yield gave no count and Tidy estimated one; the review screen marks it.';
comment on column cookbook.recipes.house_style_at is
  'When the recipe was put in the house style (a Tidy kept, or kept from a way in that applied it). Null: not tidied yet. Revert sets it null.';

notify pgrst, 'reload schema';
