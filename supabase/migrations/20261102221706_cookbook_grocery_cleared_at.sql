-- Cookbook · a cleared In cart line leaves the grocery list but stays on record
--
-- TEC-210, owner's go on 2026-11-02 ("Clear the cookbook cart. Regardless of
-- what happens downstream that gets cleared."). Clear cart now empties In cart
-- whatever King Soopers answers, and the lines do not go back to the List. They
-- are not deleted: the purchase stays on record, so the line is marked, not removed.
--
-- Shape: **additive.** One nullable column, no default, no rewrite. Nothing
-- existing reads or writes differently until the code ships. The code filters
-- `cleared_at is null` when it reads the list, so this must be applied before
-- that code deploys (Deployment applies it at merge, before merging).
--
-- ## cleared_at: marked, never deleted
--
-- CLAUDE.md, "append, don't rewrite". A cleared line keeps its `sent_at` and
-- its `cart_sends` rows (`item_id` still points at it, which a delete would
-- have set null), so the ledger of what was sent, taken back and refused stays
-- whole. Only Clear cart sets it; nothing clears it again. The list, Refresh
-- cart, Tidy and the deal scan read lines with `cleared_at is null`.
--
-- ## RLS
--
-- The table already has RLS enabled with zero policies; a column changes
-- neither that nor the grants.

alter table cookbook.grocery_items
  add column cleared_at timestamptz;
