-- Water into the brew, so the ratio has something to be a ratio of.
--
-- The brew log recorded dose and beverage mass — what you put in, and what
-- ended up in the cup. Neither is the number you actually work in while
-- brewing: you pick a dose and a ratio, and the ratio is water over dose.
-- Without a water column the ratio could only ever be typed as a note, which
-- is a number the app cannot compute with.
--
-- Additive, so it rides with its code: a new nullable column on an existing
-- table, with a check every existing row satisfies vacuously. The database
-- sitting ahead of the code is harmless here; the reverse would be an outage.
--
-- water_g is NOT beverage_g and must never be filled from it. beverage_g is
-- what you poured out; the bed keeps roughly two grams of water per gram of
-- coffee, so water in is about a tenth higher than beverage out. Conflating
-- them overstates extraction yield by that tenth, which is enough to move a
-- brew from "well extracted" to "over extracted" on paper while the cup has
-- not changed. That is why extraction_yield keeps reading beverage_g.
--
-- The ratio itself is deliberately not a column. It is water_g / dose_g, so
-- storing it would be a second place for one fact to live and a second place
-- for it to go wrong — the same reason ppm is derived from tds_percent at
-- display and extraction_yield is generated rather than accepted from a
-- client. It is computed in lib/brews.ts and never written.

alter table coffee.brews
  add column water_g numeric(7, 2) check (water_g > 0);

comment on column coffee.brews.water_g is
  'Water into the brew, in grams. Not beverage_g, which is what came out. The ratio is water_g / dose_g and is derived, never stored.';

-- PostgREST caches the schema, so a new column can be invisible to the API
-- while plainly present in SQL. Every migration here ends this way.
NOTIFY pgrst, 'reload schema';
