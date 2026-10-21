-- Lando's two tables (TEC-119): who logs, and what was logged.
--
-- `events` is append-only (charter, Never 1). A correction is a new event of the
-- same kind with `voids` naming the one it replaces; a delete is a `void` event
-- naming it. An event is live when nothing voids it. The app resolves that
-- (`apps/lando/lib/events.ts:liveEvents`); this file enforces the shape:
--
--   * a `void` must name what it voids;
--   * an event is voided at most once, so two phones correcting the same entry
--     cannot both win (the second gets a unique violation, shown as a conflict);
--   * UPDATE and DELETE on `events` raise. TRUNCATE is not covered; nothing
--     in the app issues one.
--
-- Four kinds, each logged through a short form, plus `void`. `details` is per
-- kind, validated in the app (`apps/lando/lib/events.ts:parseDetails`) and
-- held to the same shape here, every key required and no other key allowed:
--
--   potty     {what: pee|poop|both, where: outside|inside}  (inside = accident)
--   food      {type: meal|treat, item_id, item_name, kcal_per, unit, amount}
--             a snapshot of the catalogue item at log time; kcal_per, unit and
--             amount may be null (Misc has no calories or unit)
--   exercise  {type: walk|playtime|training, where, with_dogs, minutes 1-600,
--             treats 0-500, commands?} commands only on training, from the
--             fixed list in the app
--   weight    {value 0-200 exclusive, unit: lb|kg}
--   void      {}
--
-- Each shape is wrapped in coalesce(..., false): a CHECK that yields NULL
-- passes, so a missing key must read as false, never as unknown.
--
-- People are names typed in the app. No name is ever seeded here (charter,
-- Never 2).
--
-- RLS on, zero policies: the server's service role is the only reader.
--
-- **Shape: additive.** Two new tables, a trigger function and its trigger.
-- Not yet applied anywhere, so it was edited in place for the four-kind forms
-- (2026-10-20) rather than followed by a second migration.

CREATE TABLE lando.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX people_display_name_key ON lando.people (lower(btrim(display_name)));

ALTER TABLE lando.people ENABLE ROW LEVEL SECURITY;

CREATE TABLE lando.events (
  -- Chosen by the phone, so a retried save is the same row, never a second one.
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('potty', 'food', 'exercise', 'weight', 'void')),
  at timestamptz NOT NULL DEFAULT now(),
  person_id uuid REFERENCES lando.people (id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  voids uuid REFERENCES lando.events (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'void' OR voids IS NOT NULL),
  CHECK (voids IS NULL OR voids <> id),
  CONSTRAINT events_details_shape CHECK (coalesce(CASE kind
    WHEN 'potty' THEN
      details ?& ARRAY['what', 'where']
      AND details - ARRAY['what', 'where'] = '{}'::jsonb
      AND details ->> 'what' IN ('pee', 'poop', 'both')
      AND details ->> 'where' IN ('outside', 'inside')
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
      AND details - ARRAY['type', 'where', 'with_dogs', 'minutes', 'treats', 'commands'] = '{}'::jsonb
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
    WHEN 'weight' THEN
      details ?& ARRAY['value', 'unit']
      AND details - ARRAY['value', 'unit'] = '{}'::jsonb
      AND details ->> 'unit' IN ('lb', 'kg')
      AND CASE jsonb_typeof(details -> 'value')
            WHEN 'number' THEN (details ->> 'value')::numeric > 0 AND (details ->> 'value')::numeric < 200
            ELSE false END
    WHEN 'void' THEN details = '{}'::jsonb
  END, false))
);

CREATE UNIQUE INDEX events_voids_key ON lando.events (voids) WHERE voids IS NOT NULL;
CREATE INDEX events_at_idx ON lando.events (at DESC);
CREATE INDEX events_kind_idx ON lando.events (kind);

ALTER TABLE lando.events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION lando.events_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'lando.events is append-only: correct or delete by inserting an event that voids this one';
END;
$$;

-- A trigger function has no business on the API.
REVOKE EXECUTE ON FUNCTION lando.events_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON lando.events
  FOR EACH ROW EXECUTE FUNCTION lando.events_append_only();

NOTIFY pgrst, 'reload schema';
