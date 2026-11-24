-- Pit Row's schema and tables (#44, rules approved 2026-11-16, #45).
--
-- A schema of its own, never `public`; the server reads and writes it through
-- the service role only. Every table has RLS enabled in this file and zero
-- policies, so a leaked publishable key reads nothing. The grants are the next
-- migration (`grant_pitrow_schema_usage`): a new schema inherits none, and
-- creating the schema alone first lets every table below inherit that
-- migration's default privileges.
--
-- **Events are not here.** They live in the household's Outlook calendars and
-- are read through Grid's `GET /api/calendar/week` (the switch of 2026-11-17,
-- #65); Pit Row holds people, chores and who did them, nothing else.
--
-- **Ids come from the client.** Every row a tap creates has a uuid the browser
-- made, and every insert is `on conflict do nothing`, so a retried save after a
-- dropped connection lands once ("a failed save stays on screen with a retry"
-- never doubles a tick).
--
-- **Days are the person's local calendar day** (`date`), sent by the browser.
-- The server never works out "today" from its own clock, which is UTC.
--
-- **Cadence** (`chores.cadence`), counted from `start_on`:
--   once      due on `start_on` alone, and carried forward until done;
--   daily     every day;
--   weekly    on `weekdays`, 0 (Sunday) to 6 (Saturday), JavaScript's getUTCDay;
--   every_n   every `every_n` days (2 to 365).
-- A chore is retired (`archived_at`), never deleted: its completions keep a
-- chore to point at.
--
-- **Completions are append-only** (RULES.md, Never 1). A tick is a row with who
-- and when; a void is a new row whose `voids` names the tick it takes back, and
-- a tick reads as live until a void names it. A trigger refuses any UPDATE or
-- DELETE on the table, for every role, so the rule holds even if the app code is
-- wrong. (TRUNCATE is not trapped; it is not a thing the app ever sends.) A tick
-- can be voided once: `voids` is unique, and the app treats that conflict on a
-- retried void as already done.
--
-- **Shape: additive.** New schema, new tables; nothing existing is touched.

create schema if not exists pitrow;

create table pitrow.people (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 40),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table pitrow.chores (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 200),
  cadence text not null check (cadence in ('once', 'daily', 'weekly', 'every_n')),
  weekdays smallint[]
    check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  every_n smallint check (every_n is null or every_n between 2 and 365),
  start_on date not null,
  -- Optional: who the chore is usually for. Anyone may still tick it.
  assignee_id uuid references pitrow.people (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chores_cadence_fields check (
    (cadence = 'weekly') = (weekdays is not null)
    and (cadence = 'every_n') = (every_n is not null)
  )
);
create index chores_live_idx on pitrow.chores (created_at) where archived_at is null;

-- `day` is the day the chore was due and done for, the browser's own.
create table pitrow.completions (
  id uuid primary key,
  chore_id uuid not null references pitrow.chores (id),
  day date not null,
  person_id uuid not null references pitrow.people (id),
  -- Null for a tick; the id of the tick it takes back for a void.
  voids uuid unique references pitrow.completions (id),
  created_at timestamptz not null default now()
);
create index completions_day_idx on pitrow.completions (day);
create index completions_chore_idx on pitrow.completions (chore_id, day);

create function pitrow.completions_are_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'completions are append-only: write a void row';
end;
$$;

create trigger completions_no_rewrite
  before update or delete on pitrow.completions
  for each row execute function pitrow.completions_are_append_only();

alter table pitrow.people enable row level security;
alter table pitrow.chores enable row level security;
alter table pitrow.completions enable row level security;
