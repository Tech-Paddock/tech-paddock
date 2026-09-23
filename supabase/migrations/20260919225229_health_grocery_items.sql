-- The grocery list: one table, and deliberately not much of one.
--
-- Asked for by Joel on 2026-09-19 — a list built from recipes or from things
-- you just add, then taken to King Soopers. This is the **cheap version** he
-- chose: the list lives here and leaves as a copied block of text or a search
-- link per item. **No retailer credential, no OAuth, no `middleware.ts`
-- change.** The expensive version — pushing straight into a Kroger cart — needs
-- all three and is not built.
--
-- **Shape: additive.** One new table in `health`. Nothing existing is touched.
--
-- ## Why the items are text
--
-- Ingredients are plain text, because recipes store them as text — a
-- consequence of Joel's decision that a recipe's macros are estimated once at
-- creation rather than derived from linked items. So a grocery line is a
-- string, and *2 cloves garlic* and *1 tbsp minced garlic* are two rows until
-- something merges them. That is what `/api/grocery/tidy` is for, and it is a
-- deliberate tap rather than something that happens to your list on its own.
--
-- ## `source` is here before recipes are
--
-- It only ever reads `manual` today, because the recipe book does not exist —
-- it waits on a charter change. The column is here anyway for the same reason
-- `item_versions.kind` was: once rows exist, nobody can say afterwards which of
-- them came off a recipe and which were typed in, and the answer is not
-- recoverable by looking.
--
-- ## RLS
--
-- `20260918140405` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and this data. One `rls_enabled_no_policy` advisory is the
-- design working.

create type health.grocery_source as enum ('manual', 'recipe');

create table health.grocery_items (
  id         uuid primary key default gen_random_uuid(),

  -- What to buy, as you would say it to someone else in the shop.
  name       text not null check (length(trim(name)) > 0),

  -- How much, or which kind — "2 lbs", "organic", "the small tin". Free text
  -- on purpose: a quantity that parses is worth less here than one that reads,
  -- because nothing computes with it.
  note       text,

  source     health.grocery_source not null default 'manual',

  -- Ticked off in the shop. Kept rather than deleted so the list survives a
  -- mis-tap, and so tidying can leave already-bought lines alone.
  checked    boolean not null default false,

  created_at timestamptz not null default now()
);

create index grocery_items_open_idx on health.grocery_items (checked, created_at);

alter table health.grocery_items enable row level security;

comment on column health.grocery_items.source is
  'Where the line came from. Reads manual for now — the recipe book does not exist yet — and is here early because once rows exist nobody can tell afterwards which were typed and which came off a recipe.';

notify pgrst, 'reload schema';
