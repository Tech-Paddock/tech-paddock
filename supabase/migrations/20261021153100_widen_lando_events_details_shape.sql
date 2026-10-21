-- Two optional keys on Lando's entries (TEC-125).
--
-- **How this is applied.** The connector cannot run a DROP, so the owner runs
-- this file in the Supabase SQL Editor, wrapped with its own history row in
-- one transaction (supabase/README.md, "A drop does not go through the
-- connector"):
--
--   begin;
--   <this file, from ALTER TABLE through NOTIFY>
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20261021153100', 'widen_lando_events_details_shape');
--   commit;
--
-- Apply `create_lando_dogs` first. Neither file depends on the other in SQL,
-- but the app reads `lando.dogs` on every load.
--
-- `events_details_shape` (from `lando_people_and_events`) is replaced by the
-- same check plus:
--
--   potty     may carry `leash`: leashed|unleashed|pen, only when
--             where = 'outside'. Inside potties carry none.
--   exercise  may carry `dogs`: a JSON array of 1-20 uuid strings
--             (`lando.dogs` ids), only when with_dogs is true. `with_dogs`
--             stays required: the form saves it as "a dog was picked".
--
-- Every other shape is unchanged, word for word. Every existing row has
-- neither key, so it passes; the ADD validates them all as it runs. A row
-- the old check let in is let in by this one.
--
-- Each shape is wrapped in coalesce(..., false): a CHECK that yields NULL
-- passes, so a missing key must read as false, never as unknown. Casts and
-- array functions sit behind CASE, since AND does not promise to test the
-- type first. A CHECK cannot hold a subquery, so each dog id is tested with
-- a jsonpath filter (`jsonb_path_exists` is immutable). The path is `strict`:
-- lax mode unwraps a nested array and would let `[[id]]` through.
--
-- The dog ids are not a foreign key (jsonb cannot carry one); the server
-- checks them against `lando.dogs` before it saves.
--
-- **Shape: constraint swap, widening.** One ALTER TABLE: the drop and the add
-- in one statement, so there is no moment without a check. Nothing is
-- dropped that held data. Undo: the same swap back to the original check,
-- once no row carries `leash` or `dogs`.

ALTER TABLE lando.events
  DROP CONSTRAINT events_details_shape,
  ADD CONSTRAINT events_details_shape CHECK (coalesce(CASE kind
    WHEN 'potty' THEN
      details ?& ARRAY['what', 'where']
      AND details - ARRAY['what', 'where', 'leash'] = '{}'::jsonb
      AND details ->> 'what' IN ('pee', 'poop', 'both')
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
