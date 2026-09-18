-- A render outlives the template it was built from.
--
-- Approved by Joel on 2026-09-17: "Generally I want the renders to stay even if
-- the templates go." Until now `renders.template_id` was `not null` with no
-- delete action, so deleting a template any render pointed at was refused by the
-- database and, one step earlier, by the API. That was the right default while
-- the template row was the only record of what a render was built on. It is not
-- any more: `renders.template_snapshot` records the engine, the template's id,
-- its version and a sha256 of its bytes at render time, so a render still says
-- what produced it after the template row is gone.
--
-- **Shape: additive.** Every statement here relaxes a constraint — dropping a
-- NOT NULL and widening a foreign key's delete action from NO ACTION to SET
-- NULL. No existing row can violate it, and the code running before this lands
-- always writes a template_id, so the database sitting ahead of the code changes
-- nothing. Safe to apply before merging, which is what `CLAUDE.md` requires.
--
-- `thread_id` in this same table has used `on delete set null` since
-- 20260911034533 for the same reason: the thing referenced can go away without
-- taking the record of the render with it.

alter table resume.renders
  alter column template_id drop not null;

-- Verified against the project before writing this file: the constraint is named
-- `renders_template_id_fkey` and its confdeltype is 'a' (NO ACTION). Postgres
-- has no ALTER CONSTRAINT for a foreign key's delete action, so it is dropped
-- and re-added rather than modified.
alter table resume.renders
  drop constraint renders_template_id_fkey;

alter table resume.renders
  add constraint renders_template_id_fkey
  foreign key (template_id) references resume.templates (id) on delete set null;

comment on column resume.renders.template_id is
  'The template this render was built from, or null once that template has been deleted. '
  'What it was built on survives in template_snapshot regardless.';
