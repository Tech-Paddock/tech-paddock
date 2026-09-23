-- Say which date a day's total trusts, and admit what `eaten_at` is doing.
--
-- Asked for by the technical director at #122's gate: `health.entries` carries
-- both `eaten_at timestamptz` and `eaten_on date` with nothing tying them
-- together, and the next reader will wonder whether they can disagree and which
-- one a day's total reads.
--
-- **They can disagree, and the answer is less tidy than "the split is
-- deliberate".** Reading the code rather than the intent:
--
--   * `readDay` filters on `eaten_on`. That is the one a day's total trusts.
--   * `saveEntry` inserts `dictated_text`, `meal` and `eaten_on` and **never
--     sets `eaten_at`**, so it falls to its `now()` default on every row and is
--     currently an exact duplicate of `created_at`.
--
-- So `eaten_at` is not carrying its name today. It is kept rather than dropped
-- because a meal's clock time is wanted once anything sorts within a day, and
-- dropping a column is the two-pull-request dance for a column holding nothing.
-- **What it must not do is quietly look like the time you ate**, which is what
-- an uncommented column called `eaten_at` does to whoever reads it next.
--
-- **Shape: additive.** Comments only. No column, constraint, index or row is
-- touched, and nothing can fail to satisfy it.

comment on column health.entries.eaten_on is
  'The local calendar date the food was eaten. THIS is what a day''s total reads — readDay filters on it. Set explicitly by the app from the phone''s own date, not derived from a timestamp, because the server''s day and the eater''s day are different things.';

comment on column health.entries.eaten_at is
  'Intended as the clock time of the meal. THE APP DOES NOT SET IT — saveEntry omits it, so it takes its now() default and currently duplicates created_at exactly. Do not read it as the time you ate until something writes it. Kept because meal times are wanted once anything sorts within a day.';

comment on column health.entries.created_at is
  'When the row was written. Distinct from eaten_on by design: logging yesterday''s dinner this morning is a normal thing to do.';

notify pgrst, 'reload schema';
