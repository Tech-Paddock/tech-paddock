-- Cookbook · each saved product's price, every night (TEC-132)
--
-- Owner's go on 2026-10-24: "I wanna run our deal finder every night and then
-- weekly I want to compact the weeks runs so that we get like a high low mean".
-- Vercel Cron calls /api/cron/prices about 03:00 Denver time; the route reads
-- every saved product in `cookbook.products` at the chosen King Soopers and
-- appends what Kroger says. The code is `lib/priceRun.ts` (writes),
-- `lib/priceStore.ts` (this table's reads and writes) and `lib/dealRows.ts`
-- (the Deals tab).
--
-- Shape: **additive.** One new table, nothing existing is touched. The database
-- sitting ahead of the code is harmless. The code needs it: the nightly route
-- writes here and the Deals tab reads it, so apply it before the code runs.
--
-- ## One row per product, per store, per night, inserted and never changed
--
-- **Insert only** (CLAUDE.md, "append, don't rewrite"). Prices drift, and drift
-- is the whole point (`RULES.md`, *Deals*): a row that was overwritten would
-- erase what the price was. The unique constraint is the idempotency: a rerun
-- on the same night (a Vercel retry, a manual hit) inserts with
-- `on conflict do nothing` and changes nothing, so the first reading of a night
-- stands.
--
-- **`night` is the Denver calendar date of the run.** The cron is a fixed UTC
-- hour (09:00 UTC: 03:00 in daylight time, 02:00 in standard time), so it
-- always falls on the same Denver date. The date is computed in
-- America/Denver, not taken from the server's clock.
--
-- **A missed night is a gap, never backfilled or guessed.** Nothing here is
-- written for a night the cron did not run, and no later job fills one in.
--
-- ## Columns
--
-- * `product_id`: the King Soopers product code (8-14 digits), the same key as
--   `cookbook.products.product_id`. **Not a foreign key**: forgetting a product
--   in Your brands must not delete its price history, and the history is read
--   by code.
-- * `location_id`: the store the price is for, copied rather than joined, so a
--   store change starts a new series and never rewrites an old one. Prices are
--   per store, and the stoplight compares like with like.
-- * `regular` and `sale`: Kroger's regular price and its promo price at that
--   store, in dollars. Null when Kroger gave none (Kroger sends 0 for no
--   promo; the code reads that as null). **A product with neither is not
--   written**: a night with no price is a gap, not a zero. The check enforces
--   it. *Effective price* is the sale if there is one, else the regular.
-- * `in_stock`: Kroger's stock level at the store, read as yes or no; null when
--   Kroger did not say.
-- * `aisle`: Kroger's first product category that night, for the Deals tab's
--   aisle groups. Text as Kroger gave it; null when none. It lives here rather
--   than as a new column on `products` so this stays one additive file and a
--   product Kroger re-categorises shows the change over time.
-- * `recorded_at`: when the row was written, for finding out later whether the
--   cron ran on time.
--
-- No coupons are read here: Kroger's public API has none (404 on every coupon
-- route, probed 2026-10-20). Coupons are `cookbook.coupons`.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and these rows. The server uses the service role. One more
-- `rls_enabled_no_policy` advisory is the design working.

create table cookbook.price_nights (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null check (product_id ~ '^[0-9]{8,14}$'),
  location_id text not null check (location_id ~ '^[A-Za-z0-9]{8}$'),
  night       date not null,

  regular     numeric(8, 2) check (regular is null or regular > 0),
  sale        numeric(8, 2) check (sale is null or sale > 0),
  in_stock    boolean,
  aisle       text,

  recorded_at timestamptz not null default now(),

  constraint price_nights_one_per_night unique (product_id, location_id, night),
  constraint price_nights_has_a_price check (regular is not null or sale is not null)
);

-- The Deals tab reads each product's latest nights at the chosen store; the
-- Monday roll-up reads one week of them.
create index price_nights_store_night_idx on cookbook.price_nights (location_id, night desc);

alter table cookbook.price_nights enable row level security;

comment on table cookbook.price_nights is
  'One row per saved product, store and night (TEC-132): Kroger''s regular price, sale price and stock, recorded by the nightly cron. Insert only; a rerun on the same night is a no-op; a missed night is a gap, never backfilled.';
comment on column cookbook.price_nights.night is
  'The Denver calendar date of the run (the cron runs at a fixed UTC hour, 02:00-03:00 Denver).';
comment on column cookbook.price_nights.sale is
  'Kroger''s promo price at the store, or null for none. The effective price is sale if present, else regular.';

notify pgrst, 'reload schema';
