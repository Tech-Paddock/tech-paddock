-- Grid's schema and tables (#43, rules approved 2026-11-16, #47).
--
-- A schema of its own, never `public`; the server reads and writes it through
-- the service role only. Every table has RLS enabled in this file and zero
-- policies, so a leaked publishable key reads nothing. The grants are the next
-- migration (`grant_grid_schema_usage`): a new schema inherits none, and
-- creating the schema alone first lets every table below inherit that
-- migration's default privileges.
--
-- **Ids come from the client.** Every row a tap creates has a uuid the browser
-- made, and every insert is `on conflict do nothing`, so a retried save after a
-- dropped connection lands once. That is how "a failed save stays on screen with
-- a retry" never doubles a task.
--
-- **Days are the person's local calendar day** (`date`), sent by the browser.
-- The server never works out "today" from its own clock, which is UTC.
--
-- **The journal is append-only** (RULES.md, Never 1). An entry is a row in
-- `journal_versions`; an edit is a new row with the same `entry_id` and the
-- entry reads as its newest version. A trigger refuses any UPDATE or DELETE on
-- the table, for every role, so the rule holds even if the app code is wrong.
-- (TRUNCATE is not trapped; it is not a thing the app ever sends.)
--
-- **Weekdays** are 0 (Sunday) to 6 (Saturday), the numbers JavaScript's
-- getUTCDay gives for a calendar day.
--
-- **Shape: additive.** New schema, new tables; nothing existing is touched.

create schema if not exists grid;

create table grid.tasks (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 200),
  due_on date,
  -- The local day it was ticked done (the browser's, like every day here), so
  -- "done today" never depends on the server's clock.
  done_on date,
  created_at timestamptz not null default now()
);

create table grid.routines (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  weekdays smallint[] not null
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- One tick per routine per day; unticking deletes the row.
create table grid.routine_ticks (
  routine_id uuid not null references grid.routines (id),
  day date not null,
  ticked_at timestamptz not null default now(),
  primary key (routine_id, day)
);

create table grid.journal_versions (
  id uuid primary key,
  entry_id uuid not null,
  day date not null,
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index journal_versions_entry_idx on grid.journal_versions (entry_id, created_at);
create index journal_versions_day_idx on grid.journal_versions (day);

create function grid.journal_is_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'journal entries are append-only: write a new version';
end;
$$;

create trigger journal_versions_no_rewrite
  before update or delete on grid.journal_versions
  for each row execute function grid.journal_is_append_only();

-- `finished` is true when the timer ran to its end; a session ended early is
-- still logged, with how long it ran. Only finished sessions count to the streak.
create table grid.meditation_sessions (
  id uuid primary key,
  day date not null,
  planned_seconds integer not null check (planned_seconds between 30 and 7200),
  elapsed_seconds integer not null check (elapsed_seconds between 0 and 7200),
  finished boolean not null,
  created_at timestamptz not null default now()
);
create index meditation_sessions_day_idx on grid.meditation_sessions (day);

create table grid.goals (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 200),
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table grid.lists (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table grid.list_items (
  id uuid primary key,
  list_id uuid not null references grid.lists (id),
  text text not null check (char_length(text) between 1 and 200),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index list_items_list_idx on grid.list_items (list_id);

alter table grid.tasks enable row level security;
alter table grid.routines enable row level security;
alter table grid.routine_ticks enable row level security;
alter table grid.journal_versions enable row level security;
alter table grid.meditation_sessions enable row level security;
alter table grid.goals enable row level security;
alter table grid.lists enable row level security;
alter table grid.list_items enable row level security;
