-- Foods added in the app (TEC-191): "Add a food…" on the Food form.
--
-- The owner, 2026-10-29, reversed the 2026-10-20 "fixed in code, no add another" call. The code
-- catalogue (`apps/lando/lib/foods.ts`) stays; this table holds what is added after it, and the
-- picklist is the two together, Misc last.
--
-- A food entry holds `item_id` in jsonb (`lando.details_ok`), so no foreign key ties an entry to
-- its food: the id is history's key. A row is never deleted and its id never changed; `retired`
-- takes it off the picklist and `findFood` still resolves it, so an old entry can be corrected.
-- Each entry snapshots the name, kcal-per and unit at log time, so renaming never rewrites history.
-- The id is a uuid, which matches `details_ok`'s `^[a-z0-9-]{1,60}$` item_id check unchanged, so
-- `details_ok` needs no widening.
--
-- Written by the server only (`POST /api/foods`, `apps/lando/lib/journal.ts:addFood`), like
-- `lando.dogs`. Grants come from the schema's default privileges (`grant_lando_schema_usage`).
-- RLS on, zero policies: the service role is the only reader and writer.
--
-- **Shape: additive.** One new, empty table.

CREATE TABLE lando.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('meal', 'treat')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  unit text NOT NULL CHECK (unit IN ('cup', 'scoop', 'piece', 'treat', 'pop', 'gram')),
  -- Calories per unit, off the label; recorded and never shown. Null when not known.
  kcal_per numeric(10, 3) CHECK (kcal_per IS NULL OR (kcal_per > 0 AND kcal_per <= 10000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired boolean NOT NULL DEFAULT false
);

-- A name is unique within its list, ignoring case and outer spaces.
CREATE UNIQUE INDEX foods_type_name_key ON lando.foods (type, lower(btrim(name)));

ALTER TABLE lando.foods ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
