-- No potty on Lando's potty entries (TEC-129).
--
-- **How this is applied.** The connector cannot run a DROP, so the owner runs
-- this file in the Supabase SQL Editor, wrapped with its own history row in
-- one transaction (supabase/README.md, "A drop does not go through the
-- connector"):
--
--   begin;
--   <this file, from ALTER TABLE through NOTIFY>
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20261022154500', 'widen_lando_potty_none');
--   commit;
--
-- Apply it before the app code that sends `what: "none"` merges, or every
-- No potty save is refused by the check and shows as a 503.
--
-- `events_details_shape` (last replaced in `widen_lando_events_details_shape`)
-- is replaced by the same check with one change:
--
--   potty  `what` may also be 'none': a trip out with nothing done (the
--          owner's "No potty"). It keeps `where` and, outside, `leash`, as
--          any potty does.
--
-- Every other line is copied from `widen_lando_events_details_shape` word for
-- word: the ADD replaces every shape, not just the one that changes. Every
-- existing row passes, since 'none' only widens the list; the ADD validates
-- them all as it runs. A row the old check let in is let in by this one.
--
-- **Shape: constraint swap, widening.** One ALTER TABLE: the drop and the add
-- in one statement, so there is no moment without a check. Nothing is
-- dropped that held data. Undo: the same swap back to the check in
-- `widen_lando_events_details_shape`, once no row carries what = 'none'.

ALTER TABLE lando.events
  DROP CONSTRAINT events_details_shape,
  ADD CONSTRAINT events_details_shape CHECK (coalesce(CASE kind
    WHEN 'potty' THEN
      details ?& ARRAY['what', 'where']
      AND details - ARRAY['what', 'where', 'leash'] = '{}'::jsonb
      AND details ->> 'what' IN ('pee', 'poop', 'both', 'none')
      AND details ->> 'where' IN ('outside', 'inside')
      AND CASE WHEN details ? 'leash' THEN
            details ->> 'where' = 'outside'
            AND jsonb_typeof(details -> 'leash') = 'string'
            AND details ->> 'leash' IN ('leashed', 'unleashed', 'pen')
          ELSE true END
    WHEN 'food' THEN
      details ?& ARRAY['type', 'item_id', 'item_name', 'kcal_per', 'unit', 'amount']
      AND details - ARRAY['type', 'item_id', 'item_name', 'kcal_per', 'unit', 'amount'] = '{}'::jsonb
      AND details ->> 'type' IN ('meal', 'treat')
      AND jsonb_typeof(details -> 'item_id') = 'string'
      AND details ->> 'item_id' ~ '^[a-z0-9-]{1,60}$'
      AND jsonb_typeof(details -> 'item_name') = 'string'
      AND char_length(details ->> 'item_name') BETWEEN 1 AND 120
      AND jsonb_typeof(details -> 'unit') IN ('string', 'null')
      -- The casts sit behind CASE: AND does not promise to test the type first.
      AND CASE jsonb_typeof(details -> 'kcal_per')
            WHEN 'null' THEN true
            WHEN 'number' THEN (details ->> 'kcal_per')::numeric > 0
            ELSE false END
      AND CASE jsonb_typeof(details -> 'amount')
            WHEN 'null' THEN true
            WHEN 'number' THEN (details ->> 'amount')::numeric > 0 AND (details ->> 'amount')::numeric <= 1000
            ELSE false END
    WHEN 'exercise' THEN
      details ?& ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats']
      AND details - ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats', 'commands', 'dogs'] = '{}'::jsonb
      AND details ->> 'type' IN ('walk', 'playtime', 'training')
      AND details ->> 'where' IN ('outside', 'inside')
      AND jsonb_typeof(details -> 'with_dogs') = 'boolean'
      AND CASE jsonb_typeof(details -> 'minutes')
            WHEN 'number' THEN (details ->> 'minutes')::numeric BETWEEN 1 AND 600 AND (details ->> 'minutes')::numeric % 1 = 0
            ELSE false END
      AND CASE jsonb_typeof(details -> 'treats')
            WHEN 'number' THEN (details ->> 'treats')::numeric BETWEEN 0 AND 500 AND (details ->> 'treats')::numeric % 1 = 0
            ELSE false END
      AND CASE WHEN details ? 'commands' THEN
            details ->> 'type' = 'training'
            AND jsonb_typeof(details -> 'commands') = 'array'
            AND details -> 'commands' <@ '["sit", "down", "stay", "come", "leave-it", "name", "crate", "potty-bell", "touch", "heel"]'::jsonb
          ELSE true END
      AND CASE WHEN details ? 'dogs' THEN
            details -> 'with_dogs' = 'true'::jsonb
            AND CASE jsonb_typeof(details -> 'dogs')
                  WHEN 'array' THEN
                    jsonb_array_length(details -> 'dogs') BETWEEN 1 AND 20
                    AND NOT jsonb_path_exists(
                      details -> 'dogs',
                      'strict $[*] ? (@.type() != "string" || !(@ like_regex "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" flag "i"))'
                    )
                  ELSE false END
          ELSE true END
    WHEN 'weight' THEN
      details ?& ARRAY['value', 'unit']
      AND details - ARRAY['value', 'unit'] = '{}'::jsonb
      AND details ->> 'unit' IN ('lb', 'kg')
      AND CASE jsonb_typeof(details -> 'value')
            WHEN 'number' THEN (details ->> 'value')::numeric > 0 AND (details ->> 'value')::numeric < 200
            ELSE false END
    WHEN 'void' THEN details = '{}'::jsonb
  END, false));

NOTIFY pgrst, 'reload schema';
