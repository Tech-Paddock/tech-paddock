-- An entry made from another entry stores the id of the one that made it (TEC-251): a treat counted on Potty,
-- Training or Fun, a Pee or Poop tapped on a Fun form, a vet visit's weight.
--
-- `parent_id` is a plain nullable uuid with NO foreign key, on purpose. A Fun form's Pee or Poop is saved the
-- moment it is tapped, before the Fun entry itself, which may be saved later or never; its link is the id the Fun
-- entry will have, fixed when the form opened. A foreign key would refuse that save. The app checks the id's
-- shape and that an entry is not made from itself; nothing is deleted here, so the id never dangles from a delete.
--
-- It is a column and not a key in `details`: `details_ok` is a closed list per kind and widening it re-checks
-- nothing, while the link is the same for every kind and is read as a link, never as a field of the entry.
-- A correction of the parent leaves it: the link stays on the id it was made with, and the app follows `voids`
-- to the live parent. Old entries keep none (null); the app still matches their treats by time.
--
-- **Deploy order:** before the code, because the journal read selects `parent_id` (an unapplied column makes
-- every journal load a 503).
--
-- **Shape: additive.** One new nullable column and a check. Existing rows are untouched.
-- Undo: ALTER TABLE lando.events DROP COLUMN parent_id (a destructive migration; the owner runs it).

set local lock_timeout = '5s';

ALTER TABLE lando.events
  ADD COLUMN parent_id uuid,
  ADD CONSTRAINT events_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

NOTIFY pgrst, 'reload schema';
