-- Potty gets a `box` id in both pick lists (TEC-186): leash `box` ("In box", outside) and spot `box`
-- ("Box", inside). `pen` (leash) and `crate`, `pen` (spot) are retired in the app, never removed here: old
-- entries may hold them, and `lando.details_ok` only ever widens. The body below is
-- `lando_potty_minutes`'s whole, with `'box'` added to the two lists and nothing else changed. Every other
-- branch is unchanged, and `set search_path = ''` is kept (TEC-164). Only pg_catalog names are used.
--
-- **How this is applied.** Through the connector (`apply_migration`), by Deployment at merge, before
-- the code that sends `box`. A function change does not re-check existing rows; this only widens
-- (every value that passed before still passes). No DROP, no constraint swap.
-- Undo: `create or replace` the `lando_potty_minutes` body (stored rows with `box` would then be ones the
-- function calls invalid, so undo only before any is logged).
--
-- **Shape: function replace, two list values widened.**

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
        AND details - ARRAY['what', 'where', 'leash', 'spot', 'minutes', 'issue', 'photos'] = '{}'::jsonb
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
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$"))'
                  )
                ELSE false END
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
        AND details - ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats', 'commands', 'dogs', 'photos'] = '{}'::jsonb
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
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$"))'
                  )
                ELSE false END
            ELSE true END
      WHEN 'weight' THEN
        details ?& ARRAY['value', 'unit']
        AND details - ARRAY['value', 'unit', 'visit'] = '{}'::jsonb
        AND details ->> 'unit' IN ('lb', 'kg')
        AND CASE WHEN details ? 'visit' THEN
              jsonb_typeof(details -> 'visit') = 'string'
              AND details ->> 'visit' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            ELSE true END
        AND CASE jsonb_typeof(details -> 'value')
              WHEN 'number' THEN (details ->> 'value')::numeric > 0 AND (details ->> 'value')::numeric < 200
              ELSE false END
      WHEN 'health' THEN
        details ?& ARRAY['type', 'reasons']
        AND details - ARRAY['type', 'reasons', 'photos', 'issue'] = '{}'::jsonb
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
                    'strict $[*] ? (@.type() != "string" || !(@ like_regex "^health/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$"))'
                  )
                ELSE false END
            ELSE true END
      WHEN 'void' THEN details = '{}'::jsonb
    END, false)
$fn$;
