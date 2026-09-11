-- Resume Formatter rebuild.
--
-- The app reformats a Jobright-tailored resume into Joel's own template and
-- records the submission. It does not author resume content — Jobright does —
-- so the content tables from the original build go away. All four were empty.

create table resume.templates (
  id          uuid primary key default gen_random_uuid(),
  version     integer not null unique,
  name        text not null,
  -- The original .docx in Storage. Kept as bytes, not just as an extracted
  -- spec: the template doubles as the general-purpose resume to hand someone
  -- when there is no specific job.
  file_path   text not null,
  spec        jsonb not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Exactly one template may be active. Switching is deliberate, never automatic,
-- and templates are never deleted so older versions stay recoverable.
create unique index templates_single_active on resume.templates (is_active) where is_active;

create table resume.renders (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references resume.templates (id),
  -- The spec as it was at render time, so a saved render stays reproducible
  -- even after the template moves on.
  template_snapshot jsonb not null,
  source_file_path  text,
  output_file_path  text,
  parsed_content    jsonb not null,
  coverage          jsonb not null,
  content_hash      text not null,
  -- The job lives on the tracker thread; company, role, posting URL and contact
  -- are never duplicated here. Nullable, because a render can exist before you
  -- decide where to send it.
  thread_id         uuid references tracker.pipeline_threads (id) on delete set null,
  -- Distinct from created_at: a resume is usually rendered days before it goes out.
  submitted_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index renders_created_at on resume.renders (created_at desc);
create index renders_thread on resume.renders (thread_id) where thread_id is not null;

-- Deny by default, as everywhere else. The server uses the service role key,
-- which bypasses RLS; this exists purely as a fallback if a key ever leaks.
alter table resume.templates enable row level security;
alter table resume.renders enable row level security;

-- Private bucket for template originals, uploads, and rendered output.
insert into storage.buckets (id, name, public)
values ('resume-files', 'resume-files', false)
on conflict (id) do nothing;

-- Superseded by the above. Bullets first: it references entries.
drop table if exists resume.resume_bullets;
drop table if exists resume.resume_entries;
drop table if exists resume.resume_highlights;
drop table if exists resume.resume_templates;
