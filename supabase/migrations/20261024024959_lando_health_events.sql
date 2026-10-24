-- Health on Lando (TEC-137), and the last constraint swap Lando needs: the
-- shape check moves into a function.
--
-- **How this is applied.** Through the connector (`apply_migration`) like any
-- other file: one transaction, no DROP of data. `set local lock_timeout`
-- makes it fail fast instead of hanging if the table is busy; a failed
-- attempt changes nothing, so it can simply be retried. Apply
-- `create_lando_photos_bucket` first, and both before the app code that sends
-- `kind: "health"` merges: until then a Health save is refused by the old
-- check and shows as a 503.
--
-- **What it does.** `lando.details_ok(kind, details)` holds every shape
-- `events_details_shape` held after `widen_lando_potty_none`, copied word for
-- word, plus one:
--
--   health  {type: 'vet' | 'issue', reasons: [1 to 13 ids from that type's
--           fixed list], photos?: [1 to 6 storage paths]}. The lists are in
--           apps/lando/lib/events.ts (VET_REASONS, ISSUE_PICKS); add to both.
--           A photo path is `health/<uuid>.jpg|png|webp`, the object in the
--           private `lando-photos` bucket. Only the path is stored.
--
-- An unknown kind has no branch, so the function returns false: the kind test
-- lives inside it, and `events_kind_check` (the column's own check, named by
-- Postgres from the table and column in `lando_people_and_events`) is dropped
-- as redundant. `kind` stays NOT NULL. In one ALTER, `events_details_shape`
-- becomes `CHECK (lando.details_ok(kind, details))`, which validates every
-- existing row as it is added; none has kind 'health' and the other shapes are
-- unchanged, so all pass.
--
-- Before running, the names can be confirmed with:
--   select conname from pg_constraint
--    where conrelid = 'lando.events'::regclass and contype = 'c';
-- It lists events_kind_check and events_details_shape among others. After:
-- events_kind_check is gone and events_details_shape is the one that calls
-- the function.
--
-- **From now on, widening is `create or replace function lando.details_ok`
-- in a new migration, copying this whole body and changing the list or shape
-- that grows. No DROP, no constraint swap.**
--
-- **A function change does not re-check existing rows.** The constraint is not
-- re-validated when the function is replaced, so a function may only ever
-- widen. Narrowing (removing an allowed value, requiring a new key) needs a
-- validated swap: add a NOT VALID constraint calling a new function, fix or
-- void the rows that fail, VALIDATE it, then drop the old one.
--
-- **Shape: constraint swap, widening (the last).** Undo: `create or replace`
-- the function back to the `widen_lando_potty_none` body plus an 'else false'
-- for 'health', once no row has kind 'health'; or swap the checks back to
-- that migration's.

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
    END, false)
$fn$;

ALTER TABLE lando.events
  DROP CONSTRAINT events_kind_check,
  DROP CONSTRAINT events_details_shape,
  ADD CONSTRAINT events_details_shape CHECK (lando.details_ok(kind, details));

NOTIFY pgrst, 'reload schema';
