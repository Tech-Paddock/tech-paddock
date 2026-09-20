-- The Cookbook's two tables: the book, and the list you shop it from.
--
-- **Shape: additive.** Two new tables and two new enums in `cookbook`, a schema
-- that was created empty by `20260920022500` and granted by `20260920022508`.
-- Nothing existing is touched, and nothing outside this schema is referenced.
--
-- This is the design argued out with Joel across 2026-09-18 and 19 on
-- `claude/health-recipes`, which is kept on purpose rather than deleted. That
-- branch's `20260919232121_health_recipes.sql` was **never applied** — history
-- ends at `20260919220112` — so extracting recipes into their own app cost
-- nothing, and this file is that design landing where it belongs rather than a
-- new one. What changed, and why, is below.
--
-- ## What did not survive the move, and it was the best thing in the original
--
-- In Health a recipe owned exactly one `health.items` row, created with it,
-- holding the macros of one serving. That made logging "two servings of my
-- chilli" free: the dictation resolved against your own table, no model call.
--
-- **A separate app cannot write `health.items`** — that is Health's charter,
-- guardrail 5 — so the link is gone and there is no foreign key here pointing
-- anywhere near it. What replaces it is a cross-app contract, and per
-- `CLAUDE.md` that is the technical director's to design (ledger item 22), not
-- this schema's to pre-empt by growing a column shaped like a guess.
--
-- So: **nothing here references another schema, and nothing here is shaped for
-- another app to read.** When the contract is designed, it is additive on top.
--
-- ## The whole pot, not a serving
--
-- Macros are stored for everything the ingredient list puts in the pot.
-- Dividing is the lossless direction and it keeps "I got eight bowls, not six" a
-- one-field edit; storing a serving would make that correction lossy, and
-- dividing twice is the failure mode either way. `perServing` in
-- `lib/recipes.ts` is the only divider, and `tests/recipes.test.ts` asserts the
-- two directions round-trip.
--
-- ## Macros are static, so ingredients are text
--
-- Joel on 2026-09-18, against Health's own recommendation that macros be derived
-- from linked ingredient rows: *"Recipes would have static macros."* A recipe's
-- numbers are estimated once, when it is kept, and re-costing one means
-- estimating it again on purpose. That makes `ingredients` a text array rather
-- than a join table — there is nothing to join to, because nothing computes with
-- a line.
--
-- ## `source` has two values where Health's had three, and that is the guardrail
--
-- `health.macro_source` is ('hand', 'web', 'estimate'), because Health's log
-- reads published nutrition panels for chains and packaged food. **The Cookbook
-- never does.** Joel settled what an import keeps — *"Only retain recipe. Then
-- calculate macros and cals."* — so a recipe's numbers are always this app's own
-- estimate of its ingredients, even when the page it came from published a
-- nutrition panel. That panel is thrown away.
--
-- Leaving `web` out means the database refuses a lifted number rather than the
-- code merely declining to write one. A convention became a type. Adding the
-- value back later is additive if a reason ever appears; nothing here needs it.
--
-- `source_url` therefore records **where the method came from, never where a
-- number did** — which is the opposite of what the column name suggests, so it
-- carries a comment saying so.
--
-- ## `origin` exists on day one because provenance is not recoverable later
--
-- Once rows exist, nobody can say afterwards which recipes were typed, which
-- Claude wrote and which came off a page, and there is no way to work it out by
-- looking. Same reasoning as `item_versions.kind` and `grocery_items.source`
-- before it — both added early for exactly this, and `source` below is the third
-- time it has paid off.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema, so
-- RLS enabled with zero policies is the only thing between a leaked publishable
-- key and this data. The server uses the service role, which bypasses RLS
-- entirely. **Two `rls_enabled_no_policy` advisories are the design working**,
-- not a finding to clear.

-- ---------------------------------------------------------------------------
-- The book
-- ---------------------------------------------------------------------------

create type cookbook.recipe_origin as enum ('manual', 'generated', 'imported');

-- Two values, deliberately. See the header: a number lifted off a page is not
-- representable here.
create type cookbook.macro_source as enum ('hand', 'estimate');

create table cookbook.recipes (
  id          uuid primary key default gen_random_uuid(),

  name        text not null check (length(trim(name)) > 0),

  -- How many it feeds. The divisor for every macro in this row, which is why it
  -- is a whole number and why it cannot be zero.
  servings    integer not null check (servings > 0),

  -- **The whole pot.** Not a serving. See the header.
  kcal        numeric(9,2) not null check (kcal >= 0),
  protein_g   numeric(8,2) not null check (protein_g >= 0),
  carbs_g     numeric(8,2) not null check (carbs_g >= 0),
  fat_g       numeric(8,2) not null check (fat_g >= 0),

  origin      cookbook.recipe_origin not null,
  source      cookbook.macro_source not null,

  -- Which model produced the numbers. Null only for a hand-entered recipe, and
  -- the constraint below is what makes that a rule rather than a habit.
  model       text,

  -- Where the METHOD came from. Never where a number came from.
  source_url  text,

  ingredients text[] not null default '{}',
  method      text,
  note        text,

  created_at  timestamptz not null default now(),

  -- A number a model produced has to name the model. Without this, a bad
  -- estimate is indistinguishable from a figure you typed yourself, which is the
  -- one thing provenance exists to prevent.
  constraint recipe_model_matches_source check (
    (source = 'hand' and model is null) or (source <> 'hand' and model is not null)
  )
);

-- **The name collision rule, enforced by the database.**
--
-- In Health this was a uniqueness property borrowed from `items`: a recipe owned
-- an item, items are unique by normalised name, so two recipes could not share
-- one. That uniqueness left with the link, so it is stated directly here.
--
-- The expression matches `normalizeName` in `lib/recipes.ts` exactly — trim,
-- collapse internal whitespace, lowercase — so "Weeknight Chilli" and
-- "weeknight  chilli" are the same recipe. All three functions are immutable,
-- which is what makes them indexable.
create unique index recipes_name_key
  on cookbook.recipes (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create index recipes_created_idx on cookbook.recipes (created_at desc);

alter table cookbook.recipes enable row level security;

comment on column cookbook.recipes.kcal is
  'The whole pot, not one serving. Dividing is the lossless direction; see the migration header.';
comment on column cookbook.recipes.source_url is
  'Where the METHOD came from. Never where a number came from — an imported recipe''s macros are always this app''s own estimate, and the page''s nutrition panel is discarded.';
comment on column cookbook.recipes.origin is
  'Typed, generated or imported. Here on day one because once rows exist this is not recoverable by looking.';

-- ---------------------------------------------------------------------------
-- The shopping list
-- ---------------------------------------------------------------------------
--
-- **This is the Cookbook's own list, in the Cookbook's own schema.** Health's
-- `health.grocery_items` is live and stays Health's until the technical director
-- sequences the move (ledger item 23, destructive, so two pull requests). This
-- app never writes that table and never assumes it disappears on any date.
--
-- The shape is Health's `20260919220112` carried over, including the **cheap
-- version** Joel chose on 2026-09-19: the list leaves as copied text or a search
-- link per line, with no retailer credential, no OAuth and no `middleware.ts`
-- carve-out. That constraint moved with the list rather than being reopened.
--
-- `source` finally has a writer. It has existed in Health since `20260919220112`
-- with nothing producing `recipe`, because the book that would have was parked.

create type cookbook.grocery_source as enum ('manual', 'recipe');

create table cookbook.grocery_items (
  id         uuid primary key default gen_random_uuid(),

  -- What to buy, as you would say it to someone else in the shop.
  name       text not null check (length(trim(name)) > 0),

  -- How much, or which kind — "2 lbs", "organic", "the small tin". Free text on
  -- purpose: a quantity that parses is worth less here than one that reads,
  -- because nothing computes with it.
  note       text,

  source     cookbook.grocery_source not null default 'manual',

  -- Ticked off in the shop. Kept rather than deleted so the list survives a
  -- mis-tap, and so tidying can leave already-bought lines alone.
  checked    boolean not null default false,

  created_at timestamptz not null default now()
);

create index grocery_items_open_idx on cookbook.grocery_items (checked, created_at);

alter table cookbook.grocery_items enable row level security;

comment on column cookbook.grocery_items.source is
  'Whether the line came off a recipe or was typed. A tidy that merges rows from both reports manual, because that is what the merged line now is.';

notify pgrst, 'reload schema';
