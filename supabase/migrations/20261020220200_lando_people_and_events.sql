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
-- `details` is per kind and validated in the app: meal `{amount}`, weight
-- `{value, unit}`, training `{practised}`, accident `{what}`.
--
-- People are names typed in the app. No name is ever seeded here (charter,
-- Never 2).
--
-- RLS on, zero policies: the server's service role is the only reader.
--
-- **Shape: additive.** Two new tables, a trigger function and its trigger.

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
  kind text NOT NULL CHECK (kind IN ('pee', 'poop', 'accident', 'meal', 'treat', 'training', 'weight', 'void')),
  at timestamptz NOT NULL DEFAULT now(),
  person_id uuid REFERENCES lando.people (id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  voids uuid REFERENCES lando.events (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'void' OR voids IS NOT NULL),
  CHECK (voids IS NULL OR voids <> id)
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
