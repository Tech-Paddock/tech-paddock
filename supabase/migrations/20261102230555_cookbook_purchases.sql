-- Cookbook · purchases, a running record of what was actually bought (TEC-213)
--
-- Owner, 2026-11-02: "I have a thought to setup an automatic task for you to review my purchases
-- in chrome not api and update my lists weekly." Kroger's API has no order history, so a weekly
-- Claude-in-Chrome task reads King Soopers order history and pastes it into Your brands, Import
-- purchases. This is where those lines land. TEC-214 reads it to pick products.
--
-- **Shape: additive. One new table; nothing is dropped, deleted or changed.**
--
-- One row per order line, append only: the app only inserts, with `on conflict do nothing`.
--   * `order_ref` is Kroger's order number, required: it is what makes a re-paste of the same
--     order add nothing.
--   * `line_key` is the line's identity inside its order, written by the app: the product code
--     when the page showed one, else the lower-cased description, then `|`, then the size. It is a
--     column (not an expression index) because PostgREST names conflict columns, not expressions.
--     Unique with `order_ref`, so two pastes of one order cannot both land.
--   * `product_id` is the saved product it matched (by code, then by Kroger description), or null:
--     an unmatched purchase is kept. It is the products row's `id`, not the King Soopers code.
--     `on delete set null`: forgetting a product in Your brands keeps the purchase, unmatched.
--     The purchase is never deleted by it.
--
-- RLS on, zero policies: only the service role reads or writes (supabase/README.md, Grants and RLS).
-- Default privileges on the cookbook schema grant the table to the API roles as for every table.

create table cookbook.purchases (
  id          uuid primary key default gen_random_uuid(),

  ordered_on  date not null,
  order_ref   text not null check (order_ref <> ''),

  description text not null check (description <> ''),
  upc         text check (upc is null or upc ~ '^\d{8,14}$'),
  size        text,
  quantity    numeric(8,3) not null check (quantity > 0),
  price       numeric(8,2) check (price is null or price >= 0),

  line_key    text not null check (line_key <> ''),
  product_id  uuid references cookbook.products (id) on delete set null,

  imported_at timestamptz not null default now(),

  constraint purchases_one_line_per_order unique (order_ref, line_key)
);

create index purchases_product_ordered_idx on cookbook.purchases (product_id, ordered_on desc)
  where product_id is not null;
create index purchases_ordered_idx on cookbook.purchases (ordered_on desc);

alter table cookbook.purchases enable row level security;

comment on table cookbook.purchases is
  'What was actually bought, one row per order line, append only (TEC-213). Imported from a paste of King Soopers order history; product_id is the saved product it matched or null.';
