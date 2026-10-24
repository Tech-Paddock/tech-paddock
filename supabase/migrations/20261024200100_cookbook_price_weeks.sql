-- Cookbook · each product's week, rolled up on Mondays (TEC-132)
--
-- The nightly rows in `cookbook.price_nights` are the record; this table is
-- the compact shape the Deals tab's stoplight reads. On a Monday the same
-- cron route (`/api/cron/prices`, `lib/priceRun.ts`) rolls up the week that
-- just ended, Monday to Sunday, into one row per product and store. The maths
-- is `rollUpWeek` in `lib/priceWeeks.ts`.
--
-- Shape: **additive.** One new table. It must exist before the nightly route
-- runs on a Monday, and before the Deals tab reads it; apply it with
-- `cookbook_price_nights`, which it comes after.
--
-- ## One row per product, per store, per week, inserted and never changed
--
-- **Insert only**, and unique per product, store and week, so a rerun of the
-- Monday run is a no-op. The nightly rows are **kept, never deleted**: this
-- table summarises them, it does not replace them, so the thresholds can be
-- re-tuned later (TEC-138) against the real nights.
--
-- `week_start` is the **Monday** of the week rolled up (the check refuses any
-- other day). A week is rolled up once, on the Monday after it. **A Monday the
-- cron missed leaves that week without a row**: the roll-up is derived, but the
-- run is a schedule, not a repair job, and nothing here quietly fills it in
-- later.
--
-- ## Columns
--
-- Everything is over the **effective price** of each night (the sale if there
-- is one, else the regular), except `regular_mean`.
--
-- * `low`, `high`, `mean`: the week's lowest, highest and mean effective price.
--   `mean` is kept to four places so a mean of cents is not rounded twice; the
--   check keeps it between `low` and `high`.
-- * `regular_mean`: the mean of the regular price over the nights Kroger gave
--   one: the product's usual price that week, for "usually $5.00". Null when no
--   night had a regular price.
-- * `nights_on_sale`: nights with a sale price below the regular (or a sale
--   price where no regular was given).
-- * `nights_seen`: nights with a price, 1 to 7. **Fewer than seven is a week
--   with gaps**, and the mean is over the nights that exist.
--
-- `product_id` and `location_id` are as in `price_nights`: the product code
-- (no foreign key, so forgetting a product keeps its history) and the store the
-- prices are for.
--
-- ## RLS
--
-- RLS enabled with zero policies, as every table here; `20260920022508` grants
-- `anon` everything on future tables, so RLS is the only thing between a leaked
-- publishable key and these rows. The server uses the service role.

create table cookbook.price_weeks (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null check (product_id ~ '^[0-9]{8,14}$'),
  location_id    text not null check (location_id ~ '^[A-Za-z0-9]{8}$'),
  week_start     date not null check (extract(isodow from week_start) = 1),

  low            numeric(8, 2) not null check (low > 0),
  high           numeric(8, 2) not null,
  mean           numeric(10, 4) not null,
  regular_mean   numeric(10, 4) check (regular_mean is null or regular_mean > 0),
  nights_on_sale smallint not null check (nights_on_sale >= 0),
  nights_seen    smallint not null check (nights_seen between 1 and 7),

  created_at     timestamptz not null default now(),

  constraint price_weeks_one_per_week unique (product_id, location_id, week_start),
  constraint price_weeks_low_high check (low <= high),
  constraint price_weeks_mean_between check (mean >= low and mean <= high),
  constraint price_weeks_sale_nights check (nights_on_sale <= nights_seen)
);

-- The Deals tab reads each product's last twelve weeks at the chosen store.
create index price_weeks_store_week_idx on cookbook.price_weeks (location_id, week_start desc);

alter table cookbook.price_weeks enable row level security;

comment on table cookbook.price_weeks is
  'One row per saved product, store and Monday-to-Sunday week (TEC-132): low, high, mean and regular mean of the price, nights on sale and nights seen. Rolled up from price_nights on Mondays; insert only; the nightly rows are kept.';
comment on column cookbook.price_weeks.week_start is
  'The Monday of the week rolled up. A Monday the cron missed leaves that week without a row.';

notify pgrst, 'reload schema';
