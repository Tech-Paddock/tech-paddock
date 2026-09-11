alter table shared.contacts
  add column if not exists position text;

comment on column shared.contacts.position is
  'Job title / role at org. Optional, like org itself. Used as drafting context by the Message Editor.';
