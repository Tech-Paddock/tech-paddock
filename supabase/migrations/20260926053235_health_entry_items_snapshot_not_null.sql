-- Make each logged line's snapshot required: the version it came from and its
-- four macros are NOT NULL on `health.entry_items`.
--
-- TEC-21's last step. The `health_entry_items_snapshot` migration added these
-- five columns nullable, so it was safe to apply before the code that fills
-- them; that code is live, and it writes all five on every line. This tightens
-- the columns to match what the code already does, and the code that ships
-- with it drops `readDay`'s fallback for a line with no snapshot.
--
-- **Shape: additive, provided every existing row already has the values** —
-- a constraint every existing row satisfies. Read-only on 2026-09-26:
-- `health.entry_items` held one row, with no null in any of the five columns.
-- `SET NOT NULL` scans the table and fails the whole migration if a null has
-- appeared since, so it cannot half-apply; at gate time, count the nulls in
-- each column first and hold this if any count is non-zero.
--
-- Applying it before the code is safe: the code running now already writes a
-- full snapshot, and the code that ships with it only stops tolerating a line
-- without one.
--
-- `entry_items_snapshot_whole` stays. With every column NOT NULL it can only
-- ever take its second branch, which makes it redundant rather than wrong, and
-- dropping it would be a second change riding on this one.
--
-- ## RLS
--
-- Columns on an existing table: RLS is already enabled on it with zero
-- policies, and nothing here changes that.

alter table health.entry_items
  alter column item_version_id set not null,
  alter column kcal            set not null,
  alter column protein_g       set not null,
  alter column carbs_g         set not null,
  alter column fat_g           set not null;

notify pgrst, 'reload schema';
