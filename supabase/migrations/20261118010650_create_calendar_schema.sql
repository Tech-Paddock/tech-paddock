-- The household calendar's schema (#66, epic #65; schema, contract and
-- Microsoft connection approved by the owner 2026-11-17).
--
-- Grid hosts the one connection to the household's Outlook account for every
-- app, but this is NOT a Grid table: it is a schema of its own so the whole
-- thing can move to another app later by moving the route and pointing a new
-- client at this schema. Never `public`; the server reads and writes it through
-- the service role only. Every table has RLS enabled in this file and zero
-- policies. The grants are the next migration (`grant_calendar_schema_usage`),
-- and creating the schema alone first lets every table below inherit it.
--
-- `connection`  One row (id is always true). The Microsoft refresh token.
--               Microsoft replaces it on every use, so exactly one process may
--               refresh at a time: `locked_until` is that lock, taken by an
--               atomic update and expiring on its own if a flush dies.
-- `calendars`   app -> the Graph calendar made for it, so one is never made twice.
-- `outbox`      Append-only: what apps asked for, in order. A flush may only
--               stamp `sent_at` and `error`; a trigger refuses any other update
--               and every delete, for every role.
-- `events`      (app, source_id) -> the Graph event id, so a second upsert
--               updates rather than duplicates and a delete finds its event.
--
-- **Shape: additive.** New schema, new tables; nothing existing is touched.

create schema if not exists calendar;

create table calendar.connection (
  id boolean primary key default true check (id),
  refresh_token text not null,
  updated_at timestamptz not null default now(),
  locked_until timestamptz
);

create table calendar.calendars (
  app text primary key check (app ~ '^[a-z][a-z0-9-]{0,30}$'),
  graph_id text not null,
  created_at timestamptz not null default now()
);

create table calendar.outbox (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app ~ '^[a-z][a-z0-9-]{0,30}$'),
  source_id text not null check (char_length(source_id) between 1 and 200),
  op text not null check (op in ('upsert', 'delete')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create index outbox_unsent on calendar.outbox (created_at) where sent_at is null;

create table calendar.events (
  app text not null check (app ~ '^[a-z][a-z0-9-]{0,30}$'),
  source_id text not null,
  graph_id text not null,
  updated_at timestamptz not null default now(),
  primary key (app, source_id)
);

alter table calendar.connection enable row level security;
alter table calendar.calendars enable row level security;
alter table calendar.outbox enable row level security;
alter table calendar.events enable row level security;

-- Append-only: only `sent_at` and `error` may change, and nothing is deleted.
create function calendar.outbox_is_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'calendar.outbox is append-only';
  end if;
  if new.id is distinct from old.id
     or new.app is distinct from old.app
     or new.source_id is distinct from old.source_id
     or new.op is distinct from old.op
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at then
    raise exception 'calendar.outbox is append-only: only sent_at and error may change';
  end if;
  return new;
end;
$$;

create trigger outbox_is_append_only
  before update or delete on calendar.outbox
  for each row execute function calendar.outbox_is_append_only();
