-- Cookbook · the King Soopers connection, and what Kroger last said about each brand
--
-- Joel reversed the list's no-OAuth rule for King Soopers on 2026-09-26
-- (TEC-90; `apps/cookbook/RULES.md`, *Send to cart*). Send to cart needs a
-- stored Kroger sign-in and a chosen store. On 2026-10-20 he added a product
-- cache and a weekly refresh to the same build. The code that reads this is
-- `lib/krogerStore.ts`, `lib/krogerConnection.ts` and `lib/refresh.ts`.
--
-- Shape: **additive.** Two new tables in `cookbook`. Nothing existing is read
-- or written differently until the code that uses them ships, so the database
-- sitting ahead of the code is harmless and this rides with its code.
--
-- ## kroger_connection — one row, and the row is a credential
--
-- **One connection, enforced by the key**: `id` is a boolean that can only be
-- true, so a second sign-in replaces the first rather than leaving two tokens
-- to wonder about. This is a single-user tool.
--
-- **The refresh token is stored sealed, never plain.** AES-256-GCM under
-- `KROGER_TOKEN_KEY`, a Vercel variable the database never sees, written by
-- `lib/krogerCrypto.ts` as `v1:` + base64(iv ‖ tag ‖ ciphertext). The check
-- below refuses any value without that prefix, so a plaintext token cannot be
-- written here by a mistake in code: the convention is a constraint. A leaked
-- row, or a leaked backup, is then not a Kroger sign-in. Even decrypted, the
-- token's scope is `cart.basic:write product.compact` — the worst case is
-- items in Joel's cart, which is what `RULES.md` says out loud.
--
-- **The access token is not stored at all.** It lives thirty minutes and each
-- request refreshes once; storing it would be a second secret for no gain.
--
-- `location_id` and `store_name` are the store Joel picked through Kroger's
-- Locations API. **Plain text, not sealed**: a store's public ID is not a
-- credential, and the list tab shows its name. A reconnect keeps them.
--
-- `refreshed_at` is when the last refresh finished (below). Null until one has.
--
-- ## brand_products — Kroger's view of a remembered brand
--
-- A row per *this exact product* brand in `brand_preferences`, written only by
-- a refresh, **never by Joel and never by a model**. The brand row stays the
-- record of what Joel chose; this row is what Kroger last said about it at his
-- store — the product number, its description, brand and size, its page, the
-- last price, whether it was in stock, and when that was checked. Its own table
-- rather than more columns on `brand_preferences`, because the two have
-- different writers and different lifetimes: a refresh rewrites this freely and
-- must never touch the opinion beside it. **Forgetting a brand forgets its
-- product** — the foreign key cascades, because a cache for a choice that no
-- longer exists has nothing to describe.
--
-- **`missing_since` is the flag, and a flagged row is kept.** When Kroger stops
-- returning a product, the refresh sets it and Your brands says so; nothing is
-- deleted or silently re-pointed, because the brand was Joel's decision and a
-- replacement is his to make. It clears itself the next time Kroger returns the
-- product.
--
-- ## Refresh — no cron, on purpose
--
-- Opening the list tab with `refreshed_at` over seven days old starts one in
-- the background; *Refresh now* starts one on demand. **No scheduled job**: a
-- cron route would need an exception in the password gate, and that file is
-- the gate. Refreshing also turns the Kroger refresh token over, which is what
-- keeps an idle connection from expiring.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and these rows. The server uses the service role. Two more
-- `rls_enabled_no_policy` advisories are the design working.

create table cookbook.kroger_connection (
  id                   boolean primary key default true check (id),

  refresh_token_sealed text not null check (refresh_token_sealed like 'v1:%'),

  location_id          text,
  store_name           text,

  connected_at         timestamptz not null default now(),
  refreshed_at         timestamptz,
  updated_at           timestamptz not null default now()
);

alter table cookbook.kroger_connection enable row level security;

comment on table cookbook.kroger_connection is
  'The one King Soopers sign-in (TEC-90). The refresh token is AES-256-GCM sealed under KROGER_TOKEN_KEY, which the database never sees; the check refuses anything unsealed. Never sent to a browser, never logged.';
comment on column cookbook.kroger_connection.refresh_token_sealed is
  'v1: + base64(iv, tag, ciphertext). Written only by lib/krogerCrypto.ts seal(). A value without the prefix is refused.';
comment on column cookbook.kroger_connection.refreshed_at is
  'When the last refresh (prices, stock, token) finished. Opening the list tab past seven days starts another.';

create table cookbook.brand_products (
  preference_id uuid primary key references cookbook.brand_preferences (id) on delete cascade,

  product_id    text,
  description   text,
  brand         text,
  size          text,
  url           text,

  -- At the chosen store, as of checked_at. Null when Kroger gave none.
  price         numeric(8,2) check (price is null or price >= 0),
  in_stock      boolean,

  -- Set when Kroger stopped returning the product; cleared when it returns.
  missing_since timestamptz,

  checked_at    timestamptz not null default now()
);

alter table cookbook.brand_products enable row level security;

comment on table cookbook.brand_products is
  'What Kroger last said about each exact-product brand at the chosen store. Written only by a refresh; the brand row beside it stays Joel''s choice. A product Kroger stopped returning is flagged by missing_since and kept, never dropped.';

notify pgrst, 'reload schema';
