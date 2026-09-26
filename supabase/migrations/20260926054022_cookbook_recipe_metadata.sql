-- Cookbook · recipe metadata: time, meal, main, cuisine, equipment, diet, tags, rating
--
-- Agreed with Joel on 2026-09-22 (TEC-52). Reasoning here; the code that reads
-- and writes it is `lib/metadata.ts` and `lib/recipes.ts`.
--
-- Shape: **additive.** Eight new columns on `cookbook.recipes`, every one either
-- nullable or `not null default '{}'`, so every existing row already satisfies
-- every constraint below. Nothing existing is read or written differently until
-- the code that uses them ships, so the database sitting ahead of the code is
-- harmless and this rides with its code.
--
-- ## What these are for
--
-- Deciding what to cook: how long it takes, which meal it is, what it is built
-- around, whose cooking it is, what it needs, and whether you liked it. They sit
-- on the book's lean pill and nowhere near the macros. **Nothing here is a
-- number Health reads** — `GET /api/servings` is unchanged.
--
-- ## Two things that were agreed not to exist, and why they do not
--
-- **No allergen or gluten-free flag.** A wrong macro is a wrong number; a wrong
-- allergen claim is not — it is the one field in this book that could hurt
-- someone who trusted it, and most of this book's rows were written or read by a
-- model. So `diet` is a closed list of what a dish *is* (vegetarian, vegan,
-- pescatarian), enforced below, never what it is *free of*; and a "-free" tag is
-- refused in code (`lib/metadata.ts`).
--
-- **No macro-derived tag.** "High protein" is a fact about the numbers, and a
-- tag saying so goes stale the moment the recipe is re-estimated or the serving
-- count is corrected. It is computed from the macros when it is wanted, never
-- stored — so there is no column for it, and the code refuses it as a tag.
--
-- ## `rating` is Joel's
--
-- 1 to 5, or not rated. No model writes it: not a draft, not the backfill. It is
-- set on a draft before Keep it, on the typed form, or on a recipe already in the
-- book, and the code gives a model's path no way to carry one.
--
-- ## Vocabularies, and why only two are closed here
--
-- `meal` and `diet` are closed by check constraints because they are the ones a
-- filter will switch on, and a stray "Dinner " or "veggie" would silently fall out
-- of it. Widening either is a constraint swap every row already satisfies —
-- additive. `mains`, `cuisine`, `equipment` and `tags` are open text, lowercased
-- by the code, because nobody can list every cuisine in advance.
--
-- ## Existing rows
--
-- Every recipe already in the book reads as "not set" until a deliberate,
-- batched backfill fills it (TEC-52 step 2) — never as a side effect of reading
-- one. Nothing in this file writes a row.
--
-- ## RLS
--
-- No new table. `cookbook.recipes` already has RLS enabled with zero policies.

alter table cookbook.recipes
  add column total_minutes integer
    check (total_minutes is null or (total_minutes > 0 and total_minutes <= 2880)),
  add column meal text
    check (meal is null or meal in ('breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'side')),
  add column mains text[] not null default '{}',
  add column cuisine text
    check (cuisine is null or length(trim(cuisine)) > 0),
  add column equipment text[] not null default '{}',
  add column diet text[] not null default '{}'
    check (diet <@ array['vegetarian', 'vegan', 'pescatarian']::text[]),
  add column tags text[] not null default '{}',
  add column rating smallint
    check (rating is null or rating between 1 and 5);

comment on column cookbook.recipes.total_minutes is
  'Start to plate, in minutes. Null when nobody has said.';
comment on column cookbook.recipes.meal is
  'Which meal it is. A closed list; widening it is a constraint swap.';
comment on column cookbook.recipes.mains is
  'What the dish is built around — chicken, lentils. Lowercased; open text.';
comment on column cookbook.recipes.diet is
  'What the dish IS — vegetarian, vegan, pescatarian. Never what it is free of: no allergen or gluten-free claim is storable (TEC-52).';
comment on column cookbook.recipes.tags is
  'Free tags. Never a macro-derived one — "high protein" is computed from the numbers, not stored — and never a "-free" claim.';
comment on column cookbook.recipes.rating is
  '1–5, set by Joel. No model writes it, the backfill included.';

notify pgrst, 'reload schema';
