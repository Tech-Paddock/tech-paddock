-- The macro log: the first feature of `health`, and the tables it needs.
--
-- Design is `.claude/HEALTH-PLAN.md`; the guardrails it has to satisfy are in
-- `.claude/agents/health/RULES.md`; the correction-versus-change distinction
-- below was settled by the technical director in issue #116.
--
-- **Shape: additive.** Five new tables in a schema that had none. No existing
-- object is touched, nothing can violate a new constraint, and no deployed code
-- reads any of it. Safe to apply before the code that needs it.
--
-- ## Why versions rather than an UPDATE
--
-- Guardrail 3 is "never replace a hand-entered number without keeping the old
-- one", and the debug harness makes that concrete: a winning pick would
-- otherwise overwrite the very row the design calls authoritative, converting
-- hand-entered ground truth into a model's estimate permanently and invisibly.
-- So an item's numbers are append-only. `health.items` is identity and
-- `health.item_versions` is what it weighed, over time.
--
-- ## Why `kind` exists, which is the part that is easy to miss
--
-- Two different events both produce a new version, and they resolve in opposite
-- directions:
--
--   correction — the number was always wrong. It reaches backwards. Every past
--                day that referenced this item resolves to the corrected value.
--   change     — the food itself changed as of a date: a reformulation, a
--                different brand of the same yoghurt. It does NOT reach
--                backwards. Tuesday really did have the old macros, and
--                resolving Tuesday to the new ones would falsify it.
--
-- Retrofitting this column means deciding, per historical row, which of the two
-- it was — and by then nobody can tell. It is one column now and unrecoverable
-- later, which is the whole argument for it being here on day one.
--
-- **`correction` is the default deliberately.** It is the common case, and
-- guessing it wrong is visible — a total moves when you did not expect it to.
-- Guessing `change` wrong is silent: old days strand on stale numbers and
-- nothing says so.
--
-- Resolution for an entry logged on date D is therefore: take the era with the
-- greatest `effective_from <= D`, then within that era take the most recently
-- written row. Corrections carry the `effective_from` of the era they correct,
-- so they supersede inside it without starting a new one. The resolver lives in
-- `apps/health/lib/items.ts` with tests, rather than in a view — the rule is
-- subtle enough to deserve unit tests, and a view would need its own answer to
-- the RLS question below.
--
-- ## RLS
--
-- `20260918140405` ran `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES`, so
-- every table created here is granted to `anon` automatically, DELETE and
-- TRUNCATE included. RLS enabled with zero policies is deny-by-default and is
-- the only thing between a leaked publishable key and this data. The server uses
-- the service role key, which bypasses it. One `rls_enabled_no_policy` advisory
-- per table is the design working, not a warning to fix.

-- ---------------------------------------------------------------------------
-- Identity: one row per distinct thing that can be eaten.
-- ---------------------------------------------------------------------------
-- A row is a thing that was ordered, not its components: a Chick-fil-A #1 is one
-- item even though it is three things in the bag. The name carries the whole
-- specification, so "large fry" and "medium fry" are two items rather than one
-- item with a size. `normalized_name` is what the lookup matches on, so that
-- "CFA number one" and "Chick-fil-A #1" can converge on one row without the
-- display name being flattened.

create table health.items (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  normalized_name text not null unique check (length(trim(normalized_name)) > 0),
  created_at      timestamptz not null default now()
);

create index items_normalized_name_idx on health.items (normalized_name);

alter table health.items enable row level security;

-- ---------------------------------------------------------------------------
-- What it weighed, over time. Append-only.
-- ---------------------------------------------------------------------------
-- `source` is the provenance the plan calls load-bearing: it is what tells you
-- which line to scrutinise, and it is what stops the debug harness measuring
-- Haiku against its own earlier guess. A match against `hand` is evidence; a
-- match against `estimate` from the same model is not.
--
-- `model` is null for a hand-entered row and set for anything a model produced.
-- `superseded_by` is not a column: supersession is derived from
-- (effective_from, created_at), so nothing is ever written twice.

create type health.version_kind as enum ('correction', 'change');
create type health.macro_source as enum ('hand', 'web', 'estimate');

create table health.item_versions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references health.items (id) on delete cascade,

  kcal           numeric(8,2) not null check (kcal >= 0),
  protein_g      numeric(7,2) not null check (protein_g >= 0),
  carbs_g        numeric(7,2) not null check (carbs_g >= 0),
  fat_g          numeric(7,2) not null check (fat_g >= 0),

  -- Defaulted to 'correction' on purpose. See the header.
  kind           health.version_kind not null default 'correction',

  -- The date this version describes the food from — NOT the date it was
  -- written. A change dated to when you noticed it is a change dated wrongly.
  effective_from date not null,

  source         health.macro_source not null,
  model          text,
  source_url     text,
  note           text,

  created_at     timestamptz not null default now(),

  -- A hand-entered number has no model behind it; a model-produced one must say
  -- which. This is the constraint that keeps provenance honest enough for the
  -- harness to read.
  constraint model_matches_source check (
    (source = 'hand' and model is null) or (source <> 'hand' and model is not null)
  )
);

create index item_versions_resolve_idx
  on health.item_versions (item_id, effective_from desc, created_at desc);

alter table health.item_versions enable row level security;

-- ---------------------------------------------------------------------------
-- One approved dictation.
-- ---------------------------------------------------------------------------
-- The draft is not the log — guardrail 1 — so a row exists here only because
-- it was approved. `dictated_text` is kept because a later correction is
-- dictated too and resolving "that was a medium" needs to know what was said.

create type health.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table health.entries (
  id             uuid primary key default gen_random_uuid(),
  dictated_text  text not null check (length(trim(dictated_text)) > 0),

  -- When it was eaten, which defaults to now but is editable: dictation rarely
  -- says when, and "I had a bagel for breakfast" said at 2pm is not a 2pm meal.
  eaten_at       timestamptz not null default now(),
  eaten_on       date not null,
  meal           health.meal_slot not null,

  created_at     timestamptz not null default now()
);

create index entries_eaten_on_idx on health.entries (eaten_on desc);

alter table health.entries enable row level security;

-- ---------------------------------------------------------------------------
-- The foods inside one dictation.
-- ---------------------------------------------------------------------------
-- References the item's IDENTITY, not a frozen copy of its numbers. That is the
-- decision recorded in #116: a correction then fixes every past day that ate
-- this item, and because versions are append-only what any past day would have
-- shown stays reconstructible rather than lost.
--
-- `resolved_source` and `resolved_model` record what answered at approval time.
-- They are deliberately NOT the numbers — keeping the numbers here would be the
-- snapshot this design rejected — but they are what lets you ask later whether
-- a day's totals came from your own log or from a model.

create table health.entry_items (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references health.entries (id) on delete cascade,
  item_id         uuid not null references health.items (id),

  -- How many of it. The name carries the specification, quantity carries the
  -- count: two large fries is quantity 2 of one item, not a different item.
  quantity        numeric(6,2) not null default 1 check (quantity > 0),

  -- Order within the dictation, so the log reads back the way it was said.
  position        integer not null default 0,

  resolved_source health.macro_source not null,
  resolved_model  text,

  created_at      timestamptz not null default now()
);

create index entry_items_entry_idx on health.entry_items (entry_id, position);
create index entry_items_item_idx on health.entry_items (item_id);

alter table health.entry_items enable row level security;

-- ---------------------------------------------------------------------------
-- The debug harness's record.
-- ---------------------------------------------------------------------------
-- Kept away from the food log on purpose: this is measurement data and it must
-- never pollute what was actually eaten.
--
-- The pick is the label — it is the only ground truth the harness produces — so
-- it is stored rather than merely applied. Without this table "validate the
-- reliability of Haiku" has no finish line and the harness becomes permanent by
-- default.

create table health.comparisons (
  id             uuid primary key default gen_random_uuid(),

  item_name      text not null,

  -- Whatever was in the table at the time, and where it came from. Null when
  -- the item was new, which is exactly the case where the comparison says least.
  baseline       jsonb,
  baseline_source health.macro_source,
  baseline_model text,

  -- One object per model: the macros it produced, or an error it returned.
  haiku          jsonb,
  sonnet         jsonb,

  -- Agreement is computed with a numeric tolerance, never string equality: 620
  -- against 625 is agreement and 620 against 890 is not.
  agreed         boolean not null,

  -- Null when they agreed and there was nothing to choose between.
  picked         text check (picked is null or picked in ('haiku', 'sonnet', 'baseline')),

  -- Set when a pick was promoted onto the item, so a number that moved can be
  -- traced back to the run that moved it.
  applied_version_id uuid references health.item_versions (id),

  created_at     timestamptz not null default now()
);

create index comparisons_created_idx on health.comparisons (created_at desc);

alter table health.comparisons enable row level security;

notify pgrst, 'reload schema';
