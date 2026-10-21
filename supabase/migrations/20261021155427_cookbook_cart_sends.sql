-- Cookbook · what each send put in the King Soopers cart, so Take back can remove exactly that
--
-- TEC-127, owner's go on 2026-10-21 ("Approve, start the build"). Kroger's
-- public Cart API only adds: it cannot read, remove from or empty a cart. **Take
-- back** removes what Cookbook sent by sending the same products with negative
-- quantities, then marks those lines unsent. The code that reads and writes this
-- is `lib/cartSends.ts` (the database) and `lib/takeBack.ts` (the rules).
--
-- **Why a table, not more columns on `grocery_items`.** `sent_at` says *when* a
-- line last went in, not *what* went in, and the line no longer knows: its
-- quantity can be changed after a send, its product can be re-picked, and a
-- send "again" puts a second lot in. Taking back the line as it reads now would
-- remove the wrong product or the wrong count, and the wrong count is someone
-- else's shopping (anything added elsewhere must stay). So each send writes
-- what it actually sent: the product, the quantity and the Pickup/Delivery
-- choice it went with (null when Kroger refused the choice and it went without).
--
-- Shape: **additive.** One new table. Nothing existing is read or written
-- differently until the code ships, so the database sitting ahead of the code
-- is harmless and this rides with its code. Until it is applied, a send cannot
-- record what it sent (the send itself still goes in, and says so).
--
-- ## A ledger: rows are appended, the sum is what is in the cart from here
--
-- CLAUDE.md, "append, don't rewrite". A row is one product for one line, with a
-- **signed** quantity, and what Cookbook still has in the cart for a line is
-- the sum of its rows per product and mode:
--
-- - `sent`: a send that Kroger took. Positive.
-- - `taken_back`: written **before** the negative `PUT /cart/add`, so a
--   database failure after Kroger has removed it can never make a second Take
--   back remove it again (which would take the shopper's own items). Negative.
-- - `refused`: Kroger refused that take-back, so the reservation is reversed.
--   Positive, the same size. If this write fails the line reads as taken back
--   while it is still in the cart; the screen says so and offers the cart page.
--   That is the safe way round: something left in a cart is seen at checkout.
--
-- The check ties the sign to the kind, so a mistake cannot be stored the wrong
-- way round. 1 to 99 either way, the list line's own range.
--
-- **Lines sent before this table existed have no rows.** Take back skips them
-- and says to remove them on the King Soopers cart page; nothing is guessed.
--
-- ## item_id: the list line, kept through a Tidy, let go when the line is cleared
--
-- `on delete set null`, and `name` is copied: clearing a line keeps the history
-- of what was sent. **Take back only acts on lines still on the list.** Once a
-- line is gone this app cannot know whether it was bought (`RULES.md`: nothing
-- here claims to know), and removing a product from a cart that has been
-- checked out since would take whatever the shopper put in afterwards.
--
-- A Tidy replaces the lines it merges with new rows, so before it deletes them
-- it moves their ledger rows to the merged line (`item_id` is the one column
-- ever updated, and only to follow the line; what was sent is never rewritten).
-- Without that, a Tidy would quietly make a sent line impossible to take back,
-- the same way `carryCart` keeps a merge from erasing the second-send warning.
--
-- ## RLS
--
-- `20260920022508` granted `anon` everything on future tables in this schema,
-- so RLS enabled with zero policies is the only thing between a leaked
-- publishable key and these rows. The server uses the service role. One more
-- `rls_enabled_no_policy` advisory is the design working.

create table cookbook.cart_sends (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  item_id   uuid references cookbook.grocery_items (id) on delete set null,
  name      text not null,

  kind      text not null check (kind in ('sent', 'taken_back', 'refused')),
  upc       text not null check (upc ~ '^[0-9]{8,14}$'),
  quantity  integer not null check (
    (kind = 'taken_back' and quantity between -99 and -1)
    or (kind <> 'taken_back' and quantity between 1 and 99)
  ),
  modality  text check (modality in ('PICKUP', 'DELIVERY'))
);

create index cart_sends_item_id_idx on cookbook.cart_sends (item_id);

alter table cookbook.cart_sends enable row level security;

comment on table cookbook.cart_sends is
  'What Cookbook put in the King Soopers cart and took back (TEC-127), one product per row, appended. The sum per line, product and modality is what Take back removes.';
comment on column cookbook.cart_sends.quantity is
  'Signed: sent and refused are positive, taken_back negative (written before Kroger is asked, so a failed write never removes twice).';
comment on column cookbook.cart_sends.modality is
  'The Pickup/Delivery choice the product went in with; null when Kroger refused the choice and it went without. Take back sends the same.';

notify pgrst, 'reload schema';
