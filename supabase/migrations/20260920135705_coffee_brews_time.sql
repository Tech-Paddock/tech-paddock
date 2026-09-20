-- How long the brew took.
--
-- Joel, 2026-09-20: "Add brew time." The brew log recorded every decision —
-- brewer, grinder, dial, dose, water — and then stopped short of the one
-- number you are actually watching while the bed drains. A dial-in reads as a
-- sequence of attempts, and without a time two of those attempts that differ
-- only in how long they ran are indistinguishable afterwards.
--
-- Additive, so it rides with its code: a new nullable column on an existing
-- table, with a check every existing row satisfies vacuously. The database
-- sitting ahead of the code is harmless here; the reverse would be an outage.
--
-- Whole seconds, one column. "3:00" is a way of writing a duration rather
-- than a second fact about it, so minutes and seconds are not two columns and
-- the m:ss form is parsed on the way in and rebuilt on the way out — the same
-- reason ppm is derived from tds_percent rather than stored beside it.
--
-- It is a reading, not a setting. A new brew does not open with the last
-- brew's time in the box, because what gets logged here is what the timer
-- said, and repeating it would write down a stopwatch nobody started. That
-- is the line repeatOf already draws through beverage mass, TDS and rating.
--
-- Deliberately not guide_time's column. guide_time holds the roaster's own
-- words, free text, exactly as they were quoted — "23-25s", "2:40 total".
-- This is what your brew took. Keeping them apart is rule 3 of the charter:
-- the roaster's values stay separate from yours.

alter table coffee.brews
  add column brew_seconds integer check (brew_seconds > 0 and brew_seconds < 86400);

comment on column coffee.brews.brew_seconds is
  'How long this brew took, in whole seconds. Typed and shown as m:ss. Not guide_time, which is the roaster''s published wording.';

-- PostgREST caches the schema, so a new column can be invisible to the API
-- while plainly present in SQL. Every migration here ends this way.
NOTIFY pgrst, 'reload schema';
