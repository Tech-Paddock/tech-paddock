-- Resume Formatter: templates become archivable and, when nothing depends on
-- them, deletable.
--
-- The table was append-only on the reasoning that a template is the record of
-- what a render was built from. That reasoning still holds for any template a
-- render points at, and this migration does not weaken it: renders.template_id
-- is `not null references resume.templates (id)` with no delete action, so the
-- database itself refuses to delete a template with history behind it. The API
-- checks first so the user gets a sentence instead of a foreign key violation.
--
-- What changes is the case that reasoning never covered: a template uploaded by
-- mistake, or twice. It has no renders, it is nobody's history, and leaving it
-- in the list forever to satisfy a rule about history is the rule outliving its
-- reason. Archiving covers everything else.

alter table resume.templates
  add column archived_at timestamptz;

comment on column resume.templates.archived_at is
  'Hidden from the template list when set. The row and its stored .docx are kept: a render that points here must stay explainable.';

-- An archived template must not be the active one. This is a per-row condition,
-- so it is a check constraint: a unique index on a constant expression would
-- have permitted exactly one archived-and-active row rather than none.
alter table resume.templates
  add constraint templates_archived_not_active
  check (not (is_active and archived_at is not null));
