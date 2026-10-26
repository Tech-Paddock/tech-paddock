-- Cookbook · digital coupons, staged by the owner's Chrome task (TEC-132)
--
-- Kroger's public API has no coupons (404 on every coupon route, probed
-- 2026-10-20) and kingsoopers.com is never fetched from the server. The only
-- source is the owner's own signed-in Chrome, through the weekly Claude in
-- Chrome task (TEC-126), which pastes what it saw for the owner to review
-- before anything is saved. **This migration adds the table and its read path
-- only** (`lib/couponStore.ts`, shown on the Deals tab's Coupon and Stacks
-- views). The Chrome task and the paste flow come later, in their own pull
-- requests; until a row exists the tab says "no coupons staged yet".
--
-- Shape: **additive.** One new table. Nothing existing is touched, and the
-- database sitting ahead of the code is harmless. The Deals tab reads it, so
-- apply it before that code runs.
--
-- ## One row per coupon per week it was seen, inserted and never changed
--
-- **Insert only**, like `deal_scans` and the price tables: a coupon seen again
-- the next week is a new row, which is how the weeks a coupon was on offer can
-- be told later. Unique per week seen, title and amount, so pasting the same
-- review twice is refused rather than doubled.
--
-- ## Columns
--
-- * `title`: the coupon as King Soopers words it ("Honey Nut Cheerios Protein").
-- * `amount`: **text, as shown** ("$1 off 2", "Buy 3 save $5"). Coupon shapes
--   vary too much for one number, and nothing here does arithmetic on it: the
--   Deals tab shows it beside the price. The Chrome task may add a parsed value
--   later, in a migration of its own.
-- * `expires_on`: the last day the coupon works; null when none was shown. A
--   coupon with no expiry counts as active only while it is recent (two weeks
--   from `week_seen`, `lib/couponStore.ts`), so it cannot stay on the tab
--   forever.
-- * `week_seen`: the **Monday** of the week the Chrome task saw it (the check
--   refuses any other day), so "this week's coupons" is a plain comparison.
-- * `product_ids`: the King Soopers product codes the coupon lists as
--   qualifying, each 8-14 digits. **Empty is allowed**: a coupon that lists no
--   qualifying items is kept, and matches no saved product. A coupon is matched
--   to Your brands by code, never by name.
-- * `created_at`: when it was staged.
--
-- A product with a sale and a coupon is a **stack**; the join is made by the
-- reader, on `product_ids`, so this table holds no price and no foreign key (a
-- code forgotten in Your brands must not strand its coupon rows).
--
-- ## RLS
--
-- RLS enabled with zero policies, as every table here; `20260920022508` grants
-- `anon` everything on future tables, so RLS is the only thing between a leaked
-- publishable key and these rows. The server uses the service role.

create table cookbook.coupons (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  amount      text not null check (length(btrim(amount)) > 0),
  expires_on  date,
  week_seen   date not null check (extract(isodow from week_seen) = 1),
  product_ids text[] not null default '{}'
    check (cardinality(product_ids) = 0 or array_to_string(product_ids, ',') ~ '^[0-9]{8,14}(,[0-9]{8,14})*$'),
  created_at  timestamptz not null default now(),

  constraint coupons_one_per_week unique (week_seen, title, amount)
);

create index coupons_week_seen_idx on cookbook.coupons (week_seen desc);

alter table cookbook.coupons enable row level security;

comment on table cookbook.coupons is
  'Digital coupons staged from the owner''s Chrome task (TEC-126, TEC-132): title, amount as shown, expiry, the Monday of the week seen, and the qualifying product codes. Insert only; matched to saved products by code.';
comment on column cookbook.coupons.amount is
  'The offer as shown, e.g. "$1 off 2". Text; nothing computes on it.';

notify pgrst, 'reload schema';
