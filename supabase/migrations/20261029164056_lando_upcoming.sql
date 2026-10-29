-- Upcoming vet visits, vaccines, medications and other plans (TEC-192): the Upcoming tab.
--
-- An item is a plan, not a journal entry. It is edited in place, and cancelled rather than deleted
-- (`status` goes to 'cancelled' and the row stays), so nothing here touches the append-only journal
-- (`lando.events`). Marking a vet visit or vaccine done links the visit that closed it: `done_event` holds
-- that event's id. It is deliberately not a foreign key: like every other link to an event, the id is
-- history's key, and a corrected visit is a new event that voids the old one.
--
-- A repeating item (`repeat_every` of `repeat_unit`) creates the next open row when it is done; the
-- server does that, there is no trigger. `updated_at` is set by the server on each edit.
--
-- Written by the server only (`/api/upcoming`, `apps/lando/lib/upcoming-db.ts`). Grants come from the
-- schema's default privileges (`grant_lando_schema_usage`). RLS on, zero policies: the service role is
-- the only reader and writer.
--
-- **Shape: additive.** One new, empty table.

CREATE TABLE lando.upcoming (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('vet', 'vaccine', 'medication', 'other')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  due_on date NOT NULL,
  due_time time,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  repeat_every integer CHECK (repeat_every IS NULL OR repeat_every BETWEEN 1 AND 99),
  repeat_unit text CHECK (repeat_unit IS NULL OR repeat_unit IN ('week', 'month', 'year')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  done_on date,
  done_event uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A repeat is both parts or neither.
  CONSTRAINT upcoming_repeat_pair CHECK ((repeat_every IS NULL) = (repeat_unit IS NULL)),
  -- Done fields belong to a done item only.
  CONSTRAINT upcoming_done_fields CHECK (status = 'done' OR (done_on IS NULL AND done_event IS NULL))
);

-- The tab reads open items soonest first.
CREATE INDEX upcoming_open_due_idx ON lando.upcoming (due_on, due_time) WHERE status = 'open';

ALTER TABLE lando.upcoming ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
