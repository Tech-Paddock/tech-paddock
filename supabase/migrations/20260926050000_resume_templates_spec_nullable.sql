-- Resume Formatter: templates.spec becomes nullable (TEC-63, first of two).
--
-- `spec` held a summary of the template's formatting, extracted on upload, for
-- a renderer that built documents from it. That renderer is gone: every render
-- now edits the template's own file, and nothing has read `spec` since. The
-- first pull request stops writing it; this migration lets a new template row
-- be inserted without one.
--
-- The two-PR shape was approved by the technical director on 2026-09-26. The
-- column is dropped in the second pull request, once this one is live —
-- dropping it here would break the deployed code, which still writes it, in the
-- window between applying the migration and the new code going live.
--
-- **Shape: additive.** It relaxes a constraint and changes no data. Every
-- existing row keeps its spec. Code from before this migration still writes a
-- spec on every insert and is unaffected, so it is safe to apply before the code
-- that needs it — and the code does need it: the new upload path inserts no
-- spec, which the NOT NULL constraint would refuse.
--
-- No grant changes: an existing column on an existing table.

alter table resume.templates alter column spec drop not null;

comment on column resume.templates.spec is
  'Retired (TEC-63). A summary of the template''s formatting from the old spec-based renderer. '
  'No longer written or read; dropped in a later migration.';

NOTIFY pgrst, 'reload schema';
