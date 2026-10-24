-- Health on Lando: vet visits and medical issues, with photos (TEC-137).
--
-- **How this is applied.** The connector cannot run a DROP, so the owner runs
-- this file in the Supabase SQL Editor, wrapped with its own history row in
-- one transaction (supabase/README.md, "A drop does not go through the
-- connector"):
--
--   begin;
--   <this file, from ALTER TABLE through NOTIFY>
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20261024120100', 'lando_health_events');
--   commit;
--
-- Apply it before the app code that sends `kind: "health"` merges, or every
-- Health save is refused by the check and shows as a 503. Apply
-- `create_lando_photos_bucket` first (or either order: they do not touch each
-- other); a Health entry with a photo needs both.
--
-- Two checks on `lando.events` are replaced in one ALTER, so there is no
-- moment without either:
--
--   events_kind_check  (the column's own check, named by Postgres from the
--          table and column in `lando_people_and_events`) also allows 'health'.
--          Before running, confirm the name:
--            select conname from pg_constraint
--             where conrelid = 'lando.events'::regclass and contype = 'c';
--          It must list events_kind_check and events_details_shape. If the
--          kind check has another name, stop and change the DROP below.
--   events_details_shape  (last replaced in `widen_lando_potty_none`) gains
--          one shape, copied word for word otherwise:
--
--          health  {type: 'vet' | 'issue', reasons: [1 to 13 ids from that
--                  type's fixed list], photos?: [1 to 6 storage paths]}.
--                  The lists are in apps/lando/lib/events.ts (VET_REASONS,
--                  ISSUE_PICKS); add to both. A photo path is
--                  `health/<uuid>.jpg|png|webp`, the object in the private
--                  `lando-photos` bucket. Only the path is stored.
--
-- Every other line is copied from `widen_lando_potty_none`: the ADD replaces
-- every shape, not just the one that is new. Every existing row passes, since
-- no row has kind 'health' and the other shapes are unchanged; the ADD
-- validates them all as it runs.
--
-- **Shape: constraint swap, widening.** Nothing is dropped that held data.
-- Undo: the same swap back to `widen_lando_potty_none`'s check and the kind
-- list without 'health', once no row has kind 'health'.

ALTER TABLE lando.events
  DROP CONSTRAINT events_kind_check,
  ADD CONSTRAINT events_kind_check CHECK (kind IN ('potty', 'food', 'exercise', 'weight', 'health', 'void')),
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
    WHEN 'health' THEN
      details ?& ARRAY['type', 'reasons']
      AND details - ARRAY['type', 'reasons', 'photos'] = '{}'::jsonb
      AND details ->> 'type' IN ('vet', 'issue')
      -- The array functions sit behind CASE: AND does not promise to test the type first.
      AND CASE jsonb_typeof(details -> 'reasons')
            WHEN 'array' THEN
              jsonb_array_length(details -> 'reasons') BETWEEN 1 AND 13
              AND CASE details ->> 'type'
                    WHEN 'vet' THEN details -> 'reasons' <@ '["checkup", "vaccines", "deworming", "flea-tick-heartworm", "spay-neuter", "dental", "microchip", "sick", "injury", "skin-ears", "stomach", "recheck", "other"]'::jsonb
                    ELSE details -> 'reasons' <@ '["vomiting", "diarrhea", "limping", "itching-skin", "ear", "eye", "cough-sneeze", "not-eating", "low-energy", "wound", "ate-something", "other"]'::jsonb END
            ELSE false END
      AND CASE WHEN details ? 'photos' THEN
            CASE jsonb_typeof(details -> 'photos')
              WHEN 'array' THEN
                jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                AND NOT jsonb_path_exists(
                  details -> 'photos',
                  'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$"))'
                )
              ELSE false END
          ELSE true END
    WHEN 'void' THEN details = '{}'::jsonb
  END, false));

NOTIFY pgrst, 'reload schema';
