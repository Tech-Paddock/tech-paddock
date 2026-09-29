-- Health: a daily macro target, dated from when it applies (TEC-53).
--
-- Approved by Joel on 2026-09-19 as four commitments, and shaped by his answers
-- of 2026-09-29: the target is shown only as a "Left today" card on the log
-- screen, it is set on a second screen (`/targets`), a new one applies from
-- today and is never backdated, and which macros are locked is remembered.
--
-- **Shape: additive.** One new table in `health`; no existing object is
-- touched, nothing can violate a new constraint, and no deployed code reads it.
-- Safe to apply before the code that needs it.
--
-- ## Why it is dated rather than one row updated in place
--
-- For the reason `health.item_versions` is: change your budget in March and
-- February is still scored against February's. So the table is append-only and
-- a day reads the target in effect on it — the greatest `effective_from` on or
-- before that day, and within that date the most recently written row. The
-- resolver is `apps/health/lib/targets.ts:targetFor`, a pure function with
-- tests, rather than a view. A day before any row has **no target**, which the
-- app says in words; it is never read as a target of zero.
--
-- ## Why there is no calorie column
--
-- Grams are the truth and calories are derived, 4 per gram of protein and
-- carbohydrate and 9 per gram of fat. Storing both would let them disagree,
-- and then "left today" would have two answers. The check below is what makes
-- "a target of nothing" unwritable.
--
-- ## `locked`
--
-- The macros held still when the others rebalance on `/targets`. Stored with
-- the target so the lock is remembered (Joel, 2026-09-29), and constrained to
-- the three macro column names so a typo cannot quietly lock nothing.
--
-- ## RLS
--
-- The `health` schema's default privileges grant every new table to `anon`,
-- DELETE and TRUNCATE included. RLS enabled with zero policies is
-- deny-by-default and the only control between a leaked publishable key and
-- this row; the server uses the service role key. One `rls_enabled_no_policy`
-- advisory for this table is the design working.

create table health.targets (
  id             uuid primary key default gen_random_uuid(),

  -- The day this target applies FROM. The app writes the phone's today and
  -- nothing earlier.
  effective_from date not null,

  protein_g      numeric(6,1) not null check (protein_g >= 0),
  carbs_g        numeric(6,1) not null check (carbs_g >= 0),
  fat_g          numeric(6,1) not null check (fat_g >= 0),

  locked         text[] not null default '{}'
                 check (locked <@ array['protein_g', 'carbs_g', 'fat_g']::text[]),

  created_at     timestamptz not null default now(),

  constraint targets_has_calories check (4 * protein_g + 4 * carbs_g + 9 * fat_g > 0)
);

create index targets_resolve_idx on health.targets (effective_from desc, created_at desc);

alter table health.targets enable row level security;

comment on table health.targets is
  'Daily macro targets, append-only. A day reads the row with the greatest effective_from on or before it, newest created_at within that date. Calories are derived: 4p + 4c + 9f.';
comment on column health.targets.locked is
  'Macros held fixed when the others rebalance on /targets. Remembered with the target.';

notify pgrst, 'reload schema';
