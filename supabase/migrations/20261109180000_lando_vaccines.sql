-- Vaccines (TEC-259): Health gets a fifth type, `vaccine`, with a `vaccine` (DHPP, Bordetella, Leptospirosis or Rabies) and
-- an optional whole `dose` number. A vet visit's "Vaccines given" saves each one as its own entry, linked to the visit by
-- `parent_id` (TEC-251's column, which already exists and holds any uuid; nothing changes there).
--
-- **What changes.** `lando.details_ok` gains one branch inside `health` and nothing else changes: its body is
-- `lando_note_links`'s whole, with a `vaccine` WHEN placed before the `medication` one. The old vet, issue and medication
-- shapes are the same text, so every key and list value of the body before it is still here, which
-- `tests/details-ok-superset.test.ts` holds. `set search_path = ''` is kept (TEC-164). Only pg_catalog names are used.
--
-- **The list is history's key.** `'dhpp', 'bordetella', 'leptospirosis', 'rabies'` are stored in entries. A vaccine is
-- retired in the app and kept here, never removed; the owner may ask for more later, which is a newer widening.
--
-- **How this is applied.** Through the connector (`apply_migration`), by Deployment, before the merge. A function change does
-- not re-check existing rows; this only widens (every value that passed before still passes). No DROP, no constraint swap,
-- no table change. Skipped, saving a Vaccine, or a vet visit's Vaccines given, fails with a 503 and nothing else changes.
-- Read back: `select lando.details_ok('health', '{"type": "vaccine", "vaccine": "dhpp", "dose": 2}')` is true; the same with
-- `"vaccine": "parvo"` is false; `select lando.details_ok('health', '{"type": "vaccine", "vaccine": "rabies", "reasons": ["other"]}')`
-- is false.
-- Undo: `create or replace` the `lando_note_links` body (entries already saved as vaccines would then be rows the function
-- calls invalid, so undo only before any is logged).
--
-- **Shape: function replace, additive.**

set local lock_timeout = '5s';

create or replace function lando.details_ok(kind text, details jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select
  coalesce(CASE kind
      WHEN 'potty' THEN
        details ?& ARRAY['what', 'where']
        AND details - ARRAY['what', 'where', 'leash', 'spot', 'minutes', 'issue', 'photos', 'names'] = '{}'::jsonb
        AND details ->> 'what' IN ('pee', 'poop', 'both', 'none')
        AND details ->> 'where' IN ('outside', 'inside')
        AND CASE WHEN details ? 'leash' THEN
              details ->> 'where' = 'outside'
              AND jsonb_typeof(details -> 'leash') = 'string'
              AND details ->> 'leash' IN ('leashed', 'unleashed', 'pen', 'box')
            ELSE true END
        AND CASE WHEN details ? 'spot' THEN
              details ->> 'where' = 'inside'
              AND jsonb_typeof(details -> 'spot') = 'string'
              AND details ->> 'spot' IN ('box', 'crate', 'pen', 'loose')
            ELSE true END
        -- Time outside, in whole minutes. The form's chips are the form's; the database allows any whole 1 to 120.
        -- The cast sits behind CASE: AND does not promise to test the type first.
        AND CASE WHEN details ? 'minutes' THEN
              details ->> 'where' = 'outside'
              AND CASE jsonb_typeof(details -> 'minutes')
                    WHEN 'number' THEN (details ->> 'minutes')::numeric BETWEEN 1 AND 120 AND (details ->> 'minutes')::numeric % 1 = 0
                    ELSE false END
            ELSE true END
        AND CASE WHEN details ? 'issue' THEN
              jsonb_typeof(details -> 'issue') = 'string'
              AND details ->> 'issue' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            ELSE true END
        AND CASE WHEN details ? 'photos' THEN
              CASE jsonb_typeof(details -> 'photos')
                WHEN 'array' THEN
                  jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                  AND NOT jsonb_path_exists(
                    details -> 'photos',
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                  )
                ELSE false END
            ELSE true END
        -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
        -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
        AND CASE WHEN details ? 'names' THEN
              details ? 'photos'
              AND CASE jsonb_typeof(details -> 'names')
                    WHEN 'object' THEN
                      jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                      AND NOT jsonb_path_exists(
                        details -> 'names',
                        'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                      )
                      AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                    ELSE false END
            ELSE true END
      WHEN 'food' THEN
        details ?& ARRAY['type', 'item_id', 'item_name', 'kcal_per', 'unit', 'amount']
        AND details - ARRAY['type', 'item_id', 'item_name', 'kcal_per', 'unit', 'amount', 'photos', 'names'] = '{}'::jsonb
        AND details ->> 'type' IN ('meal', 'snuffle', 'treat')
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
        AND CASE WHEN details ? 'photos' THEN
              CASE jsonb_typeof(details -> 'photos')
                WHEN 'array' THEN
                  jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                  AND NOT jsonb_path_exists(
                    details -> 'photos',
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                  )
                ELSE false END
            ELSE true END
        -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
        -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
        AND CASE WHEN details ? 'names' THEN
              details ? 'photos'
              AND CASE jsonb_typeof(details -> 'names')
                    WHEN 'object' THEN
                      jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                      AND NOT jsonb_path_exists(
                        details -> 'names',
                        'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                      )
                      AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                    ELSE false END
            ELSE true END
      WHEN 'exercise' THEN
        details ?& ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats']
        AND details - ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats', 'commands', 'dogs', 'photos', 'names', 'note_id'] = '{}'::jsonb
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
        -- A link to a note (TEC-208): a training session only, and only the id of a note.
        AND CASE WHEN details ? 'note_id' THEN
              details ->> 'type' = 'training'
              AND jsonb_typeof(details -> 'note_id') = 'string'
              AND details ->> 'note_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
        AND CASE WHEN details ? 'photos' THEN
              CASE jsonb_typeof(details -> 'photos')
                WHEN 'array' THEN
                  jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                  AND NOT jsonb_path_exists(
                    details -> 'photos',
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                  )
                ELSE false END
            ELSE true END
        -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
        -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
        AND CASE WHEN details ? 'names' THEN
              details ? 'photos'
              AND CASE jsonb_typeof(details -> 'names')
                    WHEN 'object' THEN
                      jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                      AND NOT jsonb_path_exists(
                        details -> 'names',
                        'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                      )
                      AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                    ELSE false END
            ELSE true END
      WHEN 'weight' THEN
        details ?& ARRAY['value', 'unit']
        AND details - ARRAY['value', 'unit', 'visit', 'photos', 'names'] = '{}'::jsonb
        AND details ->> 'unit' IN ('lb', 'kg')
        AND CASE WHEN details ? 'visit' THEN
              jsonb_typeof(details -> 'visit') = 'string'
              AND details ->> 'visit' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            ELSE true END
        AND CASE jsonb_typeof(details -> 'value')
              WHEN 'number' THEN (details ->> 'value')::numeric > 0 AND (details ->> 'value')::numeric < 200
              ELSE false END
        AND CASE WHEN details ? 'photos' THEN
              CASE jsonb_typeof(details -> 'photos')
                WHEN 'array' THEN
                  jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                  AND NOT jsonb_path_exists(
                    details -> 'photos',
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                  )
                ELSE false END
            ELSE true END
        -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
        -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
        AND CASE WHEN details ? 'names' THEN
              details ? 'photos'
              AND CASE jsonb_typeof(details -> 'names')
                    WHEN 'object' THEN
                      jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                      AND NOT jsonb_path_exists(
                        details -> 'names',
                        'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                      )
                      AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                    ELSE false END
            ELSE true END
      WHEN 'health' THEN
        CASE WHEN details ->> 'type' = 'vaccine' THEN
          -- A vaccine (TEC-259): which one, from the list, and a dose number when it has one. It has no `reasons` and no
          -- `issue`. The list is `VACCINES` in the app; an id is history's key, so one is retired in the app and stays here.
          details ?& ARRAY['type', 'vaccine']
          AND details - ARRAY['type', 'vaccine', 'dose', 'photos', 'names', 'note_id'] = '{}'::jsonb
          AND jsonb_typeof(details -> 'vaccine') = 'string'
          AND details ->> 'vaccine' IN ('dhpp', 'bordetella', 'leptospirosis', 'rabies')
          -- A whole dose number, 1 to 6. The app asks for one only for a vaccine with a series (DHPP, Leptospirosis); the
          -- database allows it on any, since a rule that is looser here can be tightened in the app without a migration.
          -- The cast sits behind CASE: AND does not promise to test the type first.
          AND CASE WHEN details ? 'dose' THEN
                CASE jsonb_typeof(details -> 'dose')
                  WHEN 'number' THEN (details ->> 'dose')::numeric BETWEEN 1 AND 6 AND (details ->> 'dose')::numeric % 1 = 0
                  ELSE false END
              ELSE true END
          -- A link to a note (TEC-208).
          AND CASE WHEN details ? 'note_id' THEN
                jsonb_typeof(details -> 'note_id') = 'string'
                AND details ->> 'note_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              ELSE true END
          AND CASE WHEN details ? 'photos' THEN
                CASE jsonb_typeof(details -> 'photos')
                  WHEN 'array' THEN
                    jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                    AND NOT jsonb_path_exists(
                      details -> 'photos',
                      'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                    )
                  ELSE false END
              ELSE true END
          -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
          -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
          AND CASE WHEN details ? 'names' THEN
                details ? 'photos'
                AND CASE jsonb_typeof(details -> 'names')
                      WHEN 'object' THEN
                        jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                        AND NOT jsonb_path_exists(
                          details -> 'names',
                          'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                        )
                        AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                      ELSE false END
              ELSE true END
        WHEN details ->> 'type' = 'medication' THEN
          -- A medication dose (TEC-199): which medication (its lando.medications id and the name at the time), how
          -- much, in what unit, and how it was given. The story is the event's own note, which is optional here.
          details ?& ARRAY['type', 'med_id', 'med_name', 'dose', 'unit', 'route']
          AND details - ARRAY['type', 'med_id', 'med_name', 'dose', 'unit', 'route', 'photos', 'names', 'issue', 'note_id'] = '{}'::jsonb
          AND jsonb_typeof(details -> 'med_id') = 'string'
          AND details ->> 'med_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND jsonb_typeof(details -> 'med_name') = 'string'
          AND char_length(details ->> 'med_name') BETWEEN 1 AND 60
          AND jsonb_typeof(details -> 'unit') = 'string'
          AND details ->> 'unit' IN ('mg', 'ml', 'g', 'tablet', 'chew', 'capsule', 'spray', 'dose')
          AND jsonb_typeof(details -> 'route') = 'string'
          AND details ->> 'route' IN ('mouth', 'skin', 'ear-eye', 'shot')
          -- The cast sits behind CASE: AND does not promise to test the type first.
          AND CASE jsonb_typeof(details -> 'dose')
                WHEN 'number' THEN (details ->> 'dose')::numeric > 0 AND (details ->> 'dose')::numeric <= 10000
                ELSE false END
          AND CASE WHEN details ? 'issue' THEN
                jsonb_typeof(details -> 'issue') = 'string'
                AND details ->> 'issue' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              ELSE true END
          -- A link to a note (TEC-208).
          AND CASE WHEN details ? 'note_id' THEN
                jsonb_typeof(details -> 'note_id') = 'string'
                AND details ->> 'note_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              ELSE true END
          AND CASE WHEN details ? 'photos' THEN
                CASE jsonb_typeof(details -> 'photos')
                  WHEN 'array' THEN
                    jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                    AND NOT jsonb_path_exists(
                      details -> 'photos',
                      'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                    )
                  ELSE false END
              ELSE true END
          -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
          -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
          AND CASE WHEN details ? 'names' THEN
                details ? 'photos'
                AND CASE jsonb_typeof(details -> 'names')
                      WHEN 'object' THEN
                        jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                        AND NOT jsonb_path_exists(
                          details -> 'names',
                          'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                        )
                        AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                      ELSE false END
              ELSE true END
        ELSE
            details ?& ARRAY['type', 'reasons']
            AND details - ARRAY['type', 'reasons', 'photos', 'names', 'issue', 'note_id'] = '{}'::jsonb
            AND details ->> 'type' IN ('vet', 'issue')
            -- A link is for a vet visit only; a medical issue does not link to another.
            AND CASE WHEN details ? 'issue' THEN
                  details ->> 'type' = 'vet'
                  AND jsonb_typeof(details -> 'issue') = 'string'
                  AND details ->> 'issue' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                ELSE true END
            -- A link to a note (TEC-208): any health type, a medical issue too.
            AND CASE WHEN details ? 'note_id' THEN
                  jsonb_typeof(details -> 'note_id') = 'string'
                  AND details ->> 'note_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                ELSE true END
            -- The array functions sit behind CASE: AND does not promise to test the type first.
            AND CASE jsonb_typeof(details -> 'reasons')
                  WHEN 'array' THEN
                    jsonb_array_length(details -> 'reasons') BETWEEN 1 AND 13
                    AND CASE details ->> 'type'
                          WHEN 'vet' THEN details -> 'reasons' <@ '["checkup", "vaccines", "deworming", "flea-tick-heartworm", "spay-neuter", "dental", "microchip", "sick", "injury", "skin-ears", "stomach", "recheck", "other", "sick-injured", "procedure", "follow-up"]'::jsonb
                          ELSE details -> 'reasons' <@ '["vomiting", "diarrhea", "limping", "itching-skin", "ear", "eye", "cough-sneeze", "not-eating", "low-energy", "wound", "ate-something", "other", "stomach-appetite", "skin-ears-eyes", "limping-injury", "breathing-cough", "energy-behaviour"]'::jsonb END
                  ELSE false END
            AND CASE WHEN details ? 'photos' THEN
                  CASE jsonb_typeof(details -> 'photos')
                    WHEN 'array' THEN
                      jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                      AND NOT jsonb_path_exists(
                        details -> 'photos',
                        'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                      )
                    ELSE false END
                ELSE true END
            -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
            -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
            AND CASE WHEN details ? 'names' THEN
                  details ? 'photos'
                  AND CASE jsonb_typeof(details -> 'names')
                        WHEN 'object' THEN
                          jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                          AND NOT jsonb_path_exists(
                            details -> 'names',
                            'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                          )
                          AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                        ELSE false END
                ELSE true END
        END
      WHEN 'note' THEN
        -- A note (TEC-204): free text, 1 to 2000 characters, and the same attachments as every other kind. The text
        -- is `details.text`; the event's own `note` column stays empty for a note (it holds 500 at most).
        details ?& ARRAY['text']
        AND details - ARRAY['text', 'photos', 'names'] = '{}'::jsonb
        AND jsonb_typeof(details -> 'text') = 'string'
        AND char_length(details ->> 'text') BETWEEN 1 AND 2000
        AND CASE WHEN details ? 'photos' THEN
              CASE jsonb_typeof(details -> 'photos')
                WHEN 'array' THEN
                  jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6
                  AND NOT jsonb_path_exists(
                    details -> 'photos',
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$"))'
                  )
                ELSE false END
            ELSE true END
        -- The original name of each attached file, by its path: only for paths in `photos`, 1 to 6 of them, each name
        -- 1 to 200 characters. The app stores one for each attachment that is not a picture.
        AND CASE WHEN details ? 'names' THEN
              details ? 'photos'
              AND CASE jsonb_typeof(details -> 'names')
                    WHEN 'object' THEN
                      jsonb_array_length(jsonb_path_query_array(details -> 'names', 'strict $.*')) BETWEEN 1 AND 6
                      AND NOT jsonb_path_exists(
                        details -> 'names',
                        'strict $.keyvalue() ? (!(@.key like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}([.][a-z0-9]{1,10})?$") || @.value.type() != "string" || !(@.value like_regex "^.{1,200}$"))'
                      )
                      AND NOT EXISTS (select 1 from jsonb_object_keys(details -> 'names') as k where NOT ((details -> 'photos') ? k))
                    ELSE false END
            ELSE true END
      WHEN 'void' THEN details = '{}'::jsonb
    END, false)
$fn$;
