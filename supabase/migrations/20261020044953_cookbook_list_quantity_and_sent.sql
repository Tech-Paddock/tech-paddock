-- Cookbook · a quantity on each list line, and when it last went to the cart
--
-- Send to cart (TEC-90). The Kroger Cart API takes a quantity per product, and
-- a line stored none: Joel chose a column, default 1, over always sending one.
-- And the Cart API **only adds** — it cannot read the cart back — so a second
-- send of the same line doubles it unless this app remembers the first.
-- `RULES.md`: *a second send warns and shows what was already sent.* The code
-- that reads both is `lib/grocery.ts` and `lib/cart.ts`.
--
-- Shape: **additive.** Two columns. `quantity` has a default every existing
-- row takes, and `sent_at` is nullable, so the code already live — which names
-- neither — goes on working against this table until the new code ships. The
-- database sitting ahead of the code is harmless and this rides with its code.
--
-- ## quantity
--
-- **How many to put in the cart, not how much the recipe uses.** "2 cloves
-- garlic" is one head; the line's name and note stay the free text they were,
-- and this is the separate whole number Kroger needs. 1 to 99: zero is not a
-- purchase and a three-digit count is a typo.
--
-- A Tidy that merges lines keeps the **largest** quantity, not the sum — two
-- recipes' olive oil is one bottle (`carryCart` in `lib/grocery.ts`).
--
-- ## sent_at
--
-- When the line was last added to the Kroger cart by this app. Null means
-- never. A send that includes a line with a value is refused until Joel says
-- "again", and the refusal names the lines and when. A Tidy merge carries the
-- latest value of any line it absorbed, so a merge never erases the warning.
-- It is never cleared by this app: the list line's lifetime is the shop, and
-- clearing the line clears it.

alter table cookbook.grocery_items
  add column quantity integer not null default 1 check (quantity between 1 and 99),
  add column sent_at timestamptz;

comment on column cookbook.grocery_items.quantity is
  'How many to put in the Kroger cart. Whole, 1 to 99, default 1. Separate from the free-text name and note.';
comment on column cookbook.grocery_items.sent_at is
  'When this line was last added to the Kroger cart. Null means never. A second send warns, because the Cart API only adds.';

notify pgrst, 'reload schema';
