-- Coffee: photograph a bag, get the roaster's own brewing instructions for
-- that coffee, keep a searchable library.
--
-- v1 scope is the bag scanner and library alone. A brew log, a timer,
-- inventory and a brew-method lookup table are all expected eventually and
-- none are pre-empted here; each would arrive as its own table.

create schema if not exists coffee;

create table coffee.bags (
  id            uuid primary key default gen_random_uuid(),

  -- Identity. Also the duplicate check: buying the same coffee again makes a
  -- new row, offering to carry the previous my_* values forward.
  roaster       text not null,
  coffee_name   text not null,
  origin        text,
  process       text,
  varietal      text,
  roast_date    date,

  photo_path    text,

  -- Two URLs, not one. They are the same page for a coffee-specific recipe
  -- and different pages when we fall back to the roaster's house guide, so a
  -- single column would lose which of the two you are looking at.
  product_url   text,
  guide_url     text,

  -- Which tier answered. A house pour-over ratio is useful, but it is not
  -- what the roaster decided about this particular lot, and the UI says so.
  guide_status  text not null default 'not_searched'
                check (guide_status in ('coffee_specific', 'roaster_generic', 'none', 'not_searched')),

  -- The roaster's published values. guide_method is normalized onto the brew
  -- method vocabulary in lib/methods.ts; the rest stay as the page worded
  -- them, because "medium-fine, like table salt" does not survive being
  -- parsed into a number.
  guide_method  text,
  guide_ratio   text,
  guide_dose    text,
  guide_water   text,
  guide_temp    text,
  guide_grind   text,
  guide_time    text,

  -- The verbatim sentences backing every guide_* value above, with the URL
  -- each was read on. A parameter with no quote here never gets stored, so
  -- this is not decoration: it is the check that makes a fabricated recipe
  -- structurally unable to reach the table.
  guide_quotes  jsonb not null default '[]'::jsonb,
  guide_fetched_at timestamptz,

  -- Yours. my_method defaults to guide_method when a guide was found, but
  -- stays editable — brewing their filter coffee as espresso should record
  -- what you did without erasing what they suggested.
  my_method        text,
  my_grinder       text,
  my_grind_setting text,
  my_notes         text,
  my_rating        integer check (my_rating between 1 and 5),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index bags_created_at on coffee.bags (created_at desc);
create index bags_roaster_coffee on coffee.bags (lower(roaster), lower(coffee_name));

-- Deny by default, as everywhere else. The server uses the service role key,
-- which bypasses RLS; this exists purely as a fallback if a key ever leaks.
alter table coffee.bags enable row level security;

-- Private bucket for bag photos.
insert into storage.buckets (id, name, public)
values ('coffee-files', 'coffee-files', false)
on conflict (id) do nothing;
