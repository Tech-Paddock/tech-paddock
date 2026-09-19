-- The recipe book: one table, and one deliberate link into the food table.
--
-- Asked for by Joel across 2026-09-18 and 2026-09-19 — a book to fix
-- *"annoying log every individual line item"*, a generator to fix *"I don't
-- know what to cook"*, and URL import so a page becomes a recipe. Unparked by
-- his approval of Health's second-screen amendment on 2026-09-19.
--
-- **Shape: additive.** One enum and one table. Nothing existing is altered,
-- dropped or backfilled, and no existing row can fail anything here.
--
-- ## The link is the design, and it is why logging a recipe needed no new code
--
-- `item_id` is not optional and not a convenience. **Every recipe owns exactly
-- one `health.items` row**, created with it, named after it, whose single
-- version carries the macros of ONE SERVING.
--
-- That makes a serving of a recipe the same kind of thing as a Chick-fil-A #1:
-- *a thing that was eaten*, with a name that carries its whole specification.
-- So the lookup order in `lib/log.ts` resolves it at **tier 1** — your own
-- table, free, instant, no model call — and `quantity` is the number of
-- servings. Joel: *"macro tracker should only be reading from database."*
-- Nothing in the log path knows recipes exist, which is the point.
--
-- It also means a serving corrects like any other food. Type over the number
-- while approving and `saveEntry` writes a `hand` correction against the item,
-- reaching backwards through its era exactly as it does for a sandwich.
--
-- ## Why the macros here are the WHOLE recipe, not a serving
--
-- The item carries per-serving; this table carries the pot. Storing the pot is
-- what Joel described — *"Claude would estimate calories and macros when
-- created"*, for the dish — and dividing is the cheap direction. Storing per
-- serving instead would make "I got eight bowls out of it, not six" a lossy
-- edit, because the original estimate would already have been divided away.
--
-- **The macros are static.** Settled by Joel on 2026-09-18, against the
-- agent's recommendation that they be derived from linked ingredient rows:
-- *"Recipes would have static macros."* So `ingredients` is text, not a join,
-- and re-costing a recipe means estimating it again rather than recomputing it.
--
-- ## `origin` is here on day one for the reason `item_versions.kind` was
--
-- Once rows exist nobody can say afterwards which recipe you typed, which one
-- Claude invented, and which came off a web page — and the answer is not
-- recoverable by looking at it. Joel asked for this column by name.
--
-- ## Provenance, and the one rule import does not get to bend
--
-- `source` and `model` mirror `health.item_versions`, with the same constraint.
-- An imported recipe is **`estimate`**, never `web`, because Joel settled what
-- import does: *"Only retain recipe. Then calculate macros and cals."* The
-- page supplies the method and the ingredients; the numbers are ours. Where a
-- page publishes real nutrition we throw it away and estimate — named once
-- here as a cost, and not argued.
--
-- ## RLS
--
-- `20260918140405` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and this data. One `rls_enabled_no_policy` advisory is the
-- design working.

create type health.recipe_origin as enum ('manual', 'generated', 'imported');

create table health.recipes (
  id          uuid primary key default gen_random_uuid(),

  -- The food this recipe is, in the table the log reads. One each, always, and
  -- it goes when the recipe goes: a serving of a deleted recipe is not a food.
  item_id     uuid not null unique references health.items (id) on delete cascade,

  name        text not null check (length(trim(name)) > 0),

  -- How many servings the numbers below describe. A serving is those divided
  -- by this, which is what the item's version holds.
  servings    integer not null check (servings > 0),

  -- The whole pot. See the header for why this is not per serving.
  kcal        numeric(9,2) not null check (kcal >= 0),
  protein_g   numeric(8,2) not null check (protein_g >= 0),
  carbs_g     numeric(8,2) not null check (carbs_g >= 0),
  fat_g       numeric(8,2) not null check (fat_g >= 0),

  origin      health.recipe_origin not null,

  source      health.macro_source not null,
  model       text,

  -- Where an imported recipe was read from. Null for anything else, and never
  -- a reason for `source` to read `web` — see the header.
  source_url  text,

  -- Plain text, one line each, for the same reason grocery lines are text: a
  -- quantity that parses is worth less here than one that reads, because
  -- nothing computes with it. `20260919220112`'s tidy is what reconciles
  -- "2 cloves garlic" against "1 tbsp minced garlic" when they reach a list.
  ingredients text[] not null default '{}',

  method      text,
  note        text,

  created_at  timestamptz not null default now(),

  constraint recipe_model_matches_source check (
    (source = 'hand' and model is null) or (source <> 'hand' and model is not null)
  )
);

create index recipes_created_idx on health.recipes (created_at desc);

alter table health.recipes enable row level security;

comment on table health.recipes is
  'A recipe and its static macros for the whole dish. Its item_id row is the food the log sees, and that row carries the macros of ONE serving.';

comment on column health.recipes.item_id is
  'The health.items row this recipe is, so logging a serving resolves at tier 1 of the lookup order and calls no model. Created with the recipe; cascades on delete.';

comment on column health.recipes.origin is
  'manual, generated or imported. Here before it is needed because once rows exist nobody can tell afterwards which was which.';

comment on column health.recipes.source is
  'Provenance of the macros, matching health.item_versions. An imported recipe reads estimate rather than web: the page gives the method, the numbers are ours.';

notify pgrst, 'reload schema';
