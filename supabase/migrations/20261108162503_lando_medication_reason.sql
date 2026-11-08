-- A medication carries a reason (TEC-233): heartworm, flea and tick, and so on, chosen in the app.
--
-- The reason lives on the medication, not on each dose; a dose shows its medication's. Nullable: a medication
-- added before this change has none ("No reason" in the app) and is given one once, by the server only
-- (`PATCH /api/medications` updates only a row whose reason is still null). Once set it is never changed here.
--
-- The ids are history's key: retire one by leaving it out of the app's list, never delete or rename it, and
-- widen this check to add a new one. A plain column check, so no function and no search_path to pin. The ids
-- are held equal to `MED_REASONS` in `apps/lando/lib/medications.ts` by a test.
--
-- **Shape: additive.** One new nullable column. Existing rows are untouched.
-- Undo: ALTER TABLE lando.medications DROP COLUMN reason (a destructive migration; the owner runs it).

ALTER TABLE lando.medications
  ADD COLUMN reason text
  CONSTRAINT medications_reason_check CHECK (reason IN ('heartworm', 'flea-tick', 'dewormer', 'allergy', 'pain', 'antibiotic', 'joint', 'other'));

NOTIFY pgrst, 'reload schema';
