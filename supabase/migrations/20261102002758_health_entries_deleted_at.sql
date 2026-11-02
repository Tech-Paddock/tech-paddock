-- Soft delete for a logged meal (TEC-165). Additive: one nullable column, no data touched.
--
-- Deleting a meal used to remove the `health.entries` row and, by cascade, its `entry_items`. The owner
-- decided on 2026-10-26 (TEC-162) that it hides instead and keeps: `DELETE /api/entries/[id]` now sets
-- `deleted_at` and removes nothing. Every read of the log skips a row where it is set (`readDay`, which
-- the day, the list, the totals and Left today all come from).
--
-- **How this is applied.** Through the connector (`apply_migration`), by Deployment at merge, before the
-- code that reads the column. Existing rows get null, which means "not deleted", so the old code keeps
-- working against the new column.
-- Undo: `alter table health.entries drop column deleted_at;` (loses which meals were hidden).

alter table health.entries add column deleted_at timestamptz;

comment on column health.entries.deleted_at is
  'When the meal was deleted in the app; null means it is in the log. Set by DELETE /api/entries/[id], never cleared by the app. Every read of the log skips a row where this is set.';
