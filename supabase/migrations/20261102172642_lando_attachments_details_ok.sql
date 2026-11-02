-- Attachments on every entry (TEC-203): Food and Weight take photos and files too, every kind takes the original
-- name of each file, and a path may now end in any short extension.
--
-- **What changes.** The body is `lando_medication_entries`' whole, with these widenings and nothing else:
--   1. A stored path is `health/<uuid>` with an optional `.ext` of 1 to 10 lowercase letters or digits (it was
--      `.jpg`, `.png` or `.webp`), because a PDF or other file keeps its extension. Every path that passed still
--      passes. The app's `PHOTO_PATH` (`apps/lando/lib/events.ts`) is the same pattern.
--   2. Food and Weight accept the optional `photos` (1 to 6 paths, the same check as Health's) that Potty, Fun,
--      Training and Health already had.
--   3. Every kind that takes `photos` takes an optional `names`: an object of 1 to 6 entries, each key one of the
--      entry's own `photos` paths and each value a text of 1 to 200 characters (the file's original name). The
--      app stores one for each attachment that is not a picture; old entries have none and stay valid.
-- `set search_path = ''` is kept (TEC-164). Only pg_catalog names are used. Every key and list value of the body
-- before it is still here, which `tests/details-ok-superset.test.ts` holds.
--
-- **How this is applied.** Through the connector (`apply_migration`), by Deployment, before the merge and after
-- `lando_upcoming_attachments`. A function change does not re-check existing rows; this only widens (every
-- value that passed before still passes). No DROP, no constraint swap. Skipped, saving a Food or Weight entry
-- with an attachment, or any entry with a file whose path has another extension, fails with a 503.
-- Read back: `select pg_get_functiondef('lando.details_ok(text, jsonb)'::regprocedure)` holds `'names'` and
-- `([.][a-z0-9]{1,10})?$`.
-- Undo: `create or replace` the `lando_medication_entries` body (stored attachments would then be rows the
-- function calls invalid, so undo only before any is logged).
--
-- **Shape: function replace.**

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
        AND details - ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats', 'commands', 'dogs', 'photos', 'names'] = '{}'::jsonb
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
        CASE WHEN details ->> 'type' = 'medication' THEN
          -- A medication dose (TEC-199): which medication (its lando.medications id and the name at the time), how
          -- much, in what unit, and how it was given. The story is the event's own note, which is optional here.
          details ?& ARRAY['type', 'med_id', 'med_name', 'dose', 'unit', 'route']
          AND details - ARRAY['type', 'med_id', 'med_name', 'dose', 'unit', 'route', 'photos', 'names', 'issue'] = '{}'::jsonb
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
            AND details - ARRAY['type', 'reasons', 'photos', 'names', 'issue'] = '{}'::jsonb
            AND details ->> 'type' IN ('vet', 'issue')
            -- A link is for a vet visit only; a medical issue does not link to another.
            AND CASE WHEN details ? 'issue' THEN
                  details ->> 'type' = 'vet'
                  AND jsonb_typeof(details -> 'issue') = 'string'
                  AND details ->> 'issue' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
      WHEN 'void' THEN details = '{}'::jsonb
    END, false)
$fn$;
