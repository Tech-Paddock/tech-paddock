-- Friends' dogs (TEC-125): the list an exercise session picks from.
--
-- An exercise entry names the dogs it was with by id, in `details.dogs`
-- (the shape is held by `events_details_shape`, widened in
-- `widen_lando_events_details_shape`). That is jsonb, so no foreign key
-- holds it; the server checks every id is here before it saves
-- (`apps/lando/lib/journal.ts:writeEvent`). So a dog is never deleted or
-- re-id'd while an entry names it: the entry would read "another dog".
--
-- Names are added by SQL, never in the app and never in the repo (charter,
-- Never 2). No name is seeded here.
--
-- Grants come from the schema's default privileges
-- (`grant_lando_schema_usage`). RLS on, zero policies: the server's service
-- role is the only reader.
--
-- **Shape: additive.** One new, empty table.

CREATE TABLE lando.dogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dogs_name_key ON lando.dogs (lower(btrim(name)));

ALTER TABLE lando.dogs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
