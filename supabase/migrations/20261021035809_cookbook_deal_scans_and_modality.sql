-- Cookbook · the deal scan's runs, and Pickup or Delivery on the connection
--
-- TEC-121, owner's go on 2026-10-21. The list tab gets a deal scan (which
-- remembered brands and list lines are on sale at the chosen King Soopers), an
-- estimated total, and a Pickup/Delivery toggle that Send passes to Kroger's
-- cart. The code that reads this is `lib/dealStore.ts`, `lib/dealRun.ts`,
-- `lib/pricing.ts` and `lib/krogerStore.ts`. The estimate is computed on each
-- tap and stored nowhere.
--
-- Shape: **additive.** One new table, and one new column with a default on an
-- existing one-row table. Nothing existing is read or written differently
-- until the code ships, so the database sitting ahead of the code is harmless
-- and this rides with its code. It must be applied before that code runs: the
-- connection read selects `modality`.
--
-- ## deal_scans: one row per run, appended
--
-- **A run is a row, and rows are only ever inserted** (CLAUDE.md, "append,
-- don't rewrite"). A scan runs when the list tab is opened more than seven days
-- after the last one, or on *Scan for deals*; there is **no cron**, for the same
-- reason the brand refresh has none: a cron route needs an exception in the
-- password gate, and that file is the gate. The latest row is what the list tab
-- shows, and its `ran_at` is what "more than seven days" is measured from. The
-- older rows are the history: what went on sale, at which store, and when.
--
-- **Results are jsonb, not a child table.** A scan's deals are a snapshot of what
-- Kroger said at that moment (product, regular and promo price, percent off,
-- when the promo ends, which brands or lines it stands for) and are only ever
-- read back whole, by the run that wrote them. Nothing joins against them, and
-- a child table would add a second insert per run that can half-fail. Each
-- column is checked to be an array, so a run can't be stored as a bare object
-- by mistake.
--
-- `unpriced` names what Kroger returned with no price at the store; it is kept
-- apart from `failed` (could not be checked, with why) so neither reads as "not
-- on sale". `checked` is how many brands and lines the run looked at.
--
-- **No coupons are stored, because none are read.** Kroger's public API has no
-- coupon routes (404 on every one, probed 2026-10-20) and kingsoopers.com is
-- not scraped. Each deal links to King Soopers' coupon search instead, built
-- from a constant in `lib/kingsoopers.ts` when the page renders.
--
-- `location_id` and `store_name` are the store at the time of the run, copied
-- rather than joined to the connection: a store change or a disconnect must not
-- rewrite what an old scan said.
--
-- ## kroger_connection.modality
--
-- **Pickup or Delivery, remembered between visits.** On the connection row
-- because it is a fact about this King Soopers sign-in, like the store: Send
-- passes it to `PUT /cart/add`, and the estimate prices only what that mode
-- offers. `not null default 'PICKUP'` so the toggle always has a value and the
-- existing row reads as pickup. A disconnect deletes the row, and with it the
-- choice; a reconnect starts at pickup again.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and these rows. The server uses the service role. One more
-- `rls_enabled_no_policy` advisory is the design working.

create table cookbook.deal_scans (
  id          uuid primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  trigger     text not null check (trigger in ('opened', 'manual')),

  location_id text not null,
  store_name  text,

  checked     integer not null default 0 check (checked >= 0),
  deals       jsonb not null default '[]'::jsonb check (jsonb_typeof(deals) = 'array'),
  unpriced    jsonb not null default '[]'::jsonb check (jsonb_typeof(unpriced) = 'array'),
  failed      jsonb not null default '[]'::jsonb check (jsonb_typeof(failed) = 'array')
);

create index deal_scans_ran_at_idx on cookbook.deal_scans (ran_at desc);

alter table cookbook.deal_scans enable row level security;

comment on table cookbook.deal_scans is
  'One row per King Soopers deal scan (TEC-121), appended and never rewritten. Sale prices from Kroger''s Products API at the chosen store; no coupons (the public API has none). The latest row is what the list tab shows.';
comment on column cookbook.deal_scans.deals is
  'Products on sale (promo below regular), biggest percent off first: productId, description, size, url, regular, promo, percentOff, saving, endsAt, for[].';

alter table cookbook.kroger_connection
  add column modality text not null default 'PICKUP' check (modality in ('PICKUP', 'DELIVERY'));

comment on column cookbook.kroger_connection.modality is
  'Pickup or Delivery (TEC-121), remembered between visits. Send passes it to Kroger''s cart; the estimate prices what this mode offers.';

notify pgrst, 'reload schema';
