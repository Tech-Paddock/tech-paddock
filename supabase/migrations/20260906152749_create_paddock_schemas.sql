-- Schemas: one per tool, plus shared for cross-tool data
create schema if not exists shared;
create schema if not exists editor;
create schema if not exists tracker;
create schema if not exists resume;

-- Shared: contacts
create table shared.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text,
  relationship_type text,
  preferred_channel text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table shared.contacts enable row level security;

-- Message Editor
create table editor.message_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references shared.contacts(id),
  medium text not null,
  content text not null,
  sent_at timestamptz not null default now()
);
alter table editor.message_history enable row level security;

create table editor.style_guide (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  content text not null,
  updated_at timestamptz not null default now()
);
alter table editor.style_guide enable row level security;

-- Pipeline Tracker
create table tracker.pipeline_threads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references shared.contacts(id),
  company text not null,
  stage text not null check (stage in ('Applied', 'Networking', 'Interviewing', 'Offer', 'Cooling', 'Closed')),
  last_touch_date date not null default current_date,
  next_action text,
  notes text,
  open_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tracker.pipeline_threads enable row level security;

-- Resume Formatter
create table resume.resume_entries (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  title text not null,
  start_date date not null,
  end_date date,
  display_order integer not null default 0
);
alter table resume.resume_entries enable row level security;

create table resume.resume_bullets (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references resume.resume_entries(id) on delete cascade,
  content text not null,
  display_order integer not null default 0
);
alter table resume.resume_bullets enable row level security;

create table resume.resume_highlights (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  display_order integer not null default 0
);
alter table resume.resume_highlights enable row level security;

create table resume.resume_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  font text not null,
  font_size integer not null,
  margins jsonb not null,
  section_order jsonb not null,
  spacing jsonb not null,
  highlights_style text not null default 'list' check (highlights_style in ('table', 'list'))
);
alter table resume.resume_templates enable row level security;

-- Exactly one active template at a time
create unique index resume_templates_one_active
  on resume.resume_templates ((is_active))
  where is_active;
