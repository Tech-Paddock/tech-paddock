-- Cookbook · Your brands becomes one row per King Soopers product code (TEC-131)
--
-- Until now a remembered brand was phrase-first: a row in `brand_preferences`
-- per phrase, and for a product, a row in `brand_products` holding what Kroger
-- last said about it. One product bought under three phrases was three rows,
-- and nothing could say the product had changed under them. The owner asked on
-- 2026-10-22 for "1 row per product code", with every way a list line refers
-- to it on that row, after a 12 oz bag came back as 10 oz.
--
-- ## products — one row per code
--
-- * `product_id` is the King Soopers product code (what the Cart API takes as
--   `upc`), 8–14 digits, **unique**: a code is never saved twice.
-- * `names` is every way a list line may refer to it ("coke", "coke zero",
--   "12 pack coke zero"). Each is matched as whole words in code
--   (`lib/products.ts`), longest name first. **A name may sit on several
--   products** (sizes, flavours): that is Send's *Settle these*. At least one
--   name, or the row could never match a line.
-- * `count` ranks a name's products. It starts from the owner's purchase
--   history, pasted by hand (never stored anywhere else, never committed), and
--   goes up by one each time Send adds the product. It never claims what was
--   bought: the Cart API cannot read the account.
-- * `size_first` is the size first bought; `size` is what Kroger reports now.
--   **A refresh never overwrites `size_first`** (it only fills it when empty).
--   The two differing is the size-drift flag.
-- * `description`, `kroger_brand`, `size`, `url`, `price`, `in_stock`,
--   `checked_at`, `missing_since`: what Kroger last said at the chosen store,
--   written by a refresh, never by a model. `url` is also the page a pasted
--   product came with. `brand` and `note` are the owner's own words from a
--   batch or the editor; Kroger's brand is `kroger_brand`.
-- * `pack_label`, `pack_size`, `pack_unit`: the optional **pack conversion**
--   (`RULES.md`, *Storage*). `pack_label` is the shopping unit a list line
--   shows instead of the item ("Heads of Garlic"); one of it holds `pack_size`
--   of the recipe unit `pack_unit` (10 cloves). A line's recipe amount becomes
--   packs, rounded up, for the cart (`lib/lineView.ts`). Size and unit come
--   together or not at all; the label can stand alone.
-- * `successor`: when Kroger stops returning the code, the refresh sets
--   `missing_since` and stores the closest product it found by description at
--   the store, as `{product_id, description, size, url, price}`. **Replacing
--   happens only on the owner's tap**, keeps `names` and `count`, and clears it.
--
-- ## The copy
--
-- Every `product` row in `brand_preferences` is copied in, with its phrase as
-- the row's first name. Its code is the digits its page ends in, else the code
-- a refresh cached in `brand_products`. Rows sharing a code become one row,
-- their phrases its names (oldest first). The cached Kroger fields come from
-- the most recently checked of them, and **`size_first` is the size cached
-- now**. Counts start at 0; the seed sets them. A product row with no code in
-- either place cannot be a product row here and is left where it is
-- (2026-10-22: none; all three product rows carried a code).
--
-- `brand_preferences` keeps its search-word (`terms`) and old `plain` rows and
-- is still read for them. Its `product` rows and `brand_products` are no longer
-- read by this code; dropping them is a later, destructive pull request with
-- owner approval (TEC-131, *Migrations*).
--
-- Shape: **additive.** A new table, filled from rows that stay where they
-- are. Code from before this migration does not read it, so the database
-- sitting ahead of the code is harmless; the code after it needs it.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema,
-- so RLS with zero policies is the only control between a leaked publishable
-- key and these rows. The server uses the service role.

create table cookbook.products (
  id            uuid primary key default gen_random_uuid(),

  product_id    text not null unique check (product_id ~ '^\d{8,14}$'),
  names         text[] not null check (cardinality(names) > 0),
  count         integer not null default 0 check (count >= 0),

  size_first    text,

  brand         text,
  note          text,

  description   text,
  kroger_brand  text,
  size          text,
  url           text,
  price         numeric(8,2) check (price is null or price >= 0),
  in_stock      boolean,
  checked_at    timestamptz,
  missing_since timestamptz,
  successor     jsonb check (successor is null or jsonb_typeof(successor) = 'object'),

  pack_label    text,
  pack_size     numeric(10,3) check (pack_size is null or pack_size > 0),
  pack_unit     text,
  constraint products_pack_size_with_unit check ((pack_size is null) = (pack_unit is null)),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table cookbook.products enable row level security;

comment on table cookbook.products is
  'Your brands, one row per King Soopers product code (TEC-131). names: every way a list line refers to it, matched as whole words in code. count: +1 per Send add, seeded by hand. size_first is never overwritten by a refresh.';
comment on column cookbook.products.size_first is
  'The size first bought. A refresh fills it only when empty; a different size is the drift flag.';
comment on column cookbook.products.successor is
  'The closest product Kroger returned by description once this code went missing. Replaced only on the owner''s tap.';

with source as (
  select
    coalesce(
      (regexp_match(p.url, '^https://(?:www\.)?kingsoopers\.com/p/[^?#]*/(\d{8,14})/?(?:[?#].*)?$', 'i'))[1],
      case when bp.product_id ~ '^\d{8,14}$' then bp.product_id end
    ) as code,
    btrim(regexp_replace(p.phrase, '\s+', ' ', 'g')) as name,
    p.url as page,
    p.brand,
    p.note,
    p.created_at,
    p.updated_at,
    bp.description,
    bp.brand as kroger_brand,
    bp.size,
    bp.url as kroger_url,
    bp.price,
    bp.in_stock,
    bp.checked_at,
    bp.missing_since
  from cookbook.brand_preferences p
  left join cookbook.brand_products bp on bp.preference_id = p.id
  where p.kind = 'product'
),
coded as (
  select * from source where code is not null and length(name) > 0
),
latest as (
  -- The most recently checked row per code carries the Kroger fields.
  select distinct on (code) *
  from coded
  order by code, checked_at desc nulls last, updated_at desc
)
insert into cookbook.products (
  product_id, names, size_first, brand, note,
  description, kroger_brand, size, url, price, in_stock, checked_at, missing_since,
  created_at, updated_at
)
select
  l.code,
  (select array_agg(n.name order by n.first_at)
     from (select name, min(created_at) as first_at
             from coded c where c.code = l.code
            group by name) n),
  l.size,
  (select string_agg(distinct c.brand, '; ') from coded c where c.code = l.code and c.brand is not null),
  (select string_agg(distinct c.note, '; ') from coded c where c.code = l.code and c.note is not null),
  l.description,
  l.kroger_brand,
  l.size,
  coalesce(l.kroger_url, l.page),
  l.price,
  l.in_stock,
  l.checked_at,
  l.missing_since,
  (select min(c.created_at) from coded c where c.code = l.code),
  (select max(c.updated_at) from coded c where c.code = l.code)
from latest l;

notify pgrst, 'reload schema';
