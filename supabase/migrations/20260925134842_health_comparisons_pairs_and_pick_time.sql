-- The debug harness records how each model compares with the stored number,
-- and when a pick was made.
--
-- From the technical director's review of 2026-09-24 (TEC-30 item 5). The
-- harness compared Haiku with Sonnet only, but the question the plan ("Health —
-- plan", *It must be able to bypass the cache*) gives it is whether each model
-- reproduces the number already in your log. And the plan's *The picks are
-- recorded, or it is not validation* asks for when a pick was made, which
-- nothing stored.
--
-- **Shape: additive.** Three nullable columns and one CHECK that every existing
-- row satisfies: `health.comparisons` held 0 rows on 2026-09-25
-- (pg_stat_user_tables), and a row with `picked` null and `picked_at` null
-- passes it anyway. The code running when this is applied never names these
-- columns and never sets `picked` without the new code, so it keeps working.
--
-- ## RLS
--
-- Columns on an existing table with RLS enabled and zero policies; unchanged.

alter table health.comparisons
  -- Null when there was no stored number to compare with, or that model failed.
  add column haiku_vs_baseline  boolean,
  add column sonnet_vs_baseline boolean,
  -- When the pick was made. A pick is one-shot, so this is written once.
  add column picked_at          timestamptz,
  add constraint comparisons_pick_timed check ((picked is null) = (picked_at is null));

comment on column health.comparisons.agreed is
  'Haiku against Sonnet, within the numeric tolerance in apps/health/lib/macros.ts. False when either model failed. Agreement with the stored number is the two *_vs_baseline columns.';
comment on column health.comparisons.haiku_vs_baseline is
  'Whether Haiku reproduced the number stored for this food at the time of the run, within tolerance. Null when nothing was stored or Haiku failed. Read with baseline_source: a match against a hand-entered number is evidence; a match against Haiku''s own earlier estimate is not.';
comment on column health.comparisons.sonnet_vs_baseline is
  'Whether Sonnet reproduced the stored number, within tolerance. Null when nothing was stored or Sonnet failed.';
comment on column health.comparisons.picked_at is
  'When the pick was made. Set with picked, once: a run can be picked from only one time.';

notify pgrst, 'reload schema';
