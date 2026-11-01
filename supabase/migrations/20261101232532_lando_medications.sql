-- Medications added in the app (TEC-199): the Medication tab's "Add a medication…", stored like added foods.
--
-- A dose is a Health entry (`type: 'medication'`) holding a medication's `med_id` in jsonb
-- (`lando.details_ok`, `lando_medication_entries`), so no foreign key ties an entry to its medication: the id
-- is history's key. A row is never deleted and its id never changed; `retired` takes it off the pick list and
-- the app still resolves it, so an old dose can be corrected. Each entry snapshots the name and unit at dose
-- time, so renaming never rewrites history. `unit` here is the unit the pick list opens on.
--
-- Written by the server only (`POST /api/medications`, `apps/lando/lib/journal.ts:addMedication`), like
-- `lando.foods`. Grants come from the schema's default privileges (`grant_lando_schema_usage`).
-- RLS on, zero policies: the service role is the only reader and writer. The unit list is held equal to
-- `MED_UNITS` and to `lando.details_ok`'s by a test.
--
-- **Shape: additive.** One new, empty table.

CREATE TABLE lando.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  unit text NOT NULL CHECK (unit IN ('mg', 'ml', 'g', 'tablet', 'chew', 'capsule', 'spray', 'dose')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired boolean NOT NULL DEFAULT false
);

-- A name is unique, ignoring case and outer spaces.
CREATE UNIQUE INDEX medications_name_key ON lando.medications (lower(btrim(name)));

ALTER TABLE lando.medications ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
