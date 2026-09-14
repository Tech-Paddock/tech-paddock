-- Split what you bought from what you did with it.
--
-- coffee.bags held both: the purchase and the roaster's published guide on one
-- side, and a single dial-in — brewer, grinder, grind setting, rating — on the
-- other. One dial-in per bag can only ever record the last thing you tried,
-- which is the opposite of what dialling in is: a sequence of attempts you
-- want to compare.
--
-- So a bag is now a purchase and what the roaster said about it, both fixed
-- the moment you buy it, and every variable thing is a brew. One bag, many
-- brews. This is the repo's "prefer append over rewrite for anything that
-- accumulates" applied to the thing that was accumulating.
--
-- Safe to drop rather than migrate: across all three existing bags the only
-- dial-in value of any kind is a single my_method of 'other', which carried no
-- meaning even against the old vocabulary. Nothing else has ever been set.

-- ---------------------------------------------------------------- the bag

alter table coffee.bags
  -- Each row is a purchase, and the only date on one was created_at, which
  -- records when you scanned it rather than when you bought it.
  add column purchased_date date;

alter table coffee.bags
  drop column my_method,
  drop column my_grinder,
  drop column my_grind_setting,
  -- A rating describes a cup, and a cup is a brew. Kept on the brew instead.
  drop column my_rating;

-- my_notes stays. "Blackcurrant, jammy" describes the coffee and outlives any
-- one attempt at it; per-brew observations live on the brew.

comment on column coffee.bags.purchased_date is
  'When you bought the bag, as against created_at, which is when you scanned it.';

-- --------------------------------------------------------------- the brew

create table coffee.brews (
  id         uuid primary key default gen_random_uuid(),
  bag_id     uuid not null references coffee.bags(id) on delete cascade,
  brewed_at  timestamptz not null default now(),

  -- The dial-in, which is what this table exists to let you vary.
  brewer        text,
  brew_method   text,
  grinder       text,
  grind_setting text,

  -- What you measured. dose and beverage are grams; beverage is what ends up
  -- in the cup, not what went into the kettle — the bed keeps roughly two
  -- grams of water per gram of coffee, so using water-in overstates the yield.
  dose_g      numeric(6, 2) check (dose_g > 0),
  beverage_g  numeric(7, 2) check (beverage_g > 0),

  -- Stored once, in percent, because a refractometer reads percent. ppm is
  -- percent x 10000 and is derived at display rather than stored: two columns
  -- for one measurement is two things that can disagree.
  tds_percent numeric(4, 2) check (tds_percent > 0 and tds_percent < 10),

  -- Not an input. Extraction yield is a function of the three measurements
  -- above, and storing it as its own editable number would let it drift from
  -- the brew it claims to describe. Null inputs give null, which is honest.
  extraction_yield numeric(5, 2)
    generated always as (round(beverage_g * tds_percent / dose_g, 2)) stored,

  rating smallint check (rating between 1 and 5),
  notes  text,

  created_at timestamptz not null default now()
);

create index brews_bag_id_brewed_at_idx on coffee.brews (bag_id, brewed_at desc);

comment on table coffee.brews is
  'One brew of one bag. Many per bag: dialling in is a sequence of attempts, and the point is comparing them.';

comment on column coffee.brews.tds_percent is
  'Refractometer reading as a percentage. ppm is derived (percent x 10000), never stored.';

comment on column coffee.brews.extraction_yield is
  'Generated: beverage_g * tds_percent / dose_g. Not editable, so it cannot disagree with its own inputs.';

comment on column coffee.brews.beverage_g is
  'Mass in the cup, not water into the kettle. The bed retains roughly 2g per gram of coffee.';

-- Deny by default, like every table here. The server uses the service role,
-- which bypasses this; RLS is the fallback if a publishable key ever leaks.
alter table coffee.brews enable row level security;

-- The schema's ALTER DEFAULT PRIVILEGES should cover a new table, but the
-- grants trap in supabase/README.md has bitten this project twice, and an
-- explicit grant costs nothing.
grant all on coffee.brews to anon, authenticated, service_role;

-- PostgREST caches the schema, so a new table can be invisible to the API
-- while plainly present in SQL — which reads as "relation does not exist"
-- against a table you can see in the dashboard. Every migration here that
-- adds a table or changes grants ends this way.
NOTIFY pgrst, 'reload schema';
