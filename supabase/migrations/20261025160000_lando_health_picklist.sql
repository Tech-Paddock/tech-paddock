-- Lando Health becomes a high-level pick (TEC-139), and Fun and Training take
-- photos. Widen only: `lando.details_ok` is replaced with its whole current
-- body (`lando_health_events`'s) and three things grown.
--
--   health.reasons  gains new ids, kept alongside every old one (old entries
--                   still hold them and several at a time):
--                   vet    sick-injured, procedure, follow-up
--                          (checkup, vaccines, other are reused)
--                   issue  stomach-appetite, skin-ears-eyes, limping-injury,
--                          breathing-cough, energy-behaviour
--                          (other is reused)
--                   The app offers one pick; the database still takes 1 to 13.
--   exercise.photos optional, 1 to 6 storage paths of the same
--                   `health/<uuid>.jpg|png|webp` pattern, in the same private
--                   `lando-photos` bucket. Old exercise entries have none.
--
-- **How this is applied.** Through the connector (`apply_migration`), before
-- the app code that sends either (until then a Health save with a new id, or
-- a Fun or Training save with a photo, is refused by the old check and shows
-- as a 503). `set local lock_timeout` fails fast if the table is busy; a failed
-- attempt changes nothing and can be retried. No DROP, no constraint swap.
--
-- **A function change does not re-check existing rows**, which is safe
-- because this only widens: every row the old function accepted, this one
-- accepts. Undo: `create or replace` the `lando_health_events` body, once no
-- row uses a new id or an exercise photo.
--
-- **Shape: function replace, widening.**

set local lock_timeout = '5s';

create or replace function lando.details_ok(kind text, details jsonb)
returns boolean
language sql
immutable
as $fn$
  select
  coalesce(CASE kind
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
