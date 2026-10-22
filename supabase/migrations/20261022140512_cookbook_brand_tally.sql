-- Cookbook · a count on each remembered brand, and several products per phrase (TEC-51)
--
-- **The count ranks choices; it never claims what was bought.** `tally` starts
-- from the owner's own purchase history — supplied by hand through Paste a
-- batch, after a review, and never stored or committed anywhere else — and goes
-- up by one each time Send to cart adds that product. Settle these lists a
-- line's candidates most-counted first. The Cart API cannot read the account,
-- so nothing here can check the number against a receipt, and nothing says it
-- does.
--
-- **Several products under one phrase.** `cheerios` can now be Honey Nut, Plain
-- and a family size at once: Send puts a line that matches exactly one saved
-- product straight in, and lists a line that matches several under Settle
-- these for one pick. That needs one row per phrase *and product*, so the
-- one-row-per-phrase index from `cookbook_brand_preferences` is replaced:
--
-- * product rows are unique on (phrase, url) — the same page twice under one
--   phrase is still refused. The app compares product numbers, not URLs
--   (`lib/brandBatch.ts`); the URL is the database's backstop.
-- * search-word and plain rows stay one per phrase, as before.
--
-- The phrase expression is unchanged, so `normalizePhrase` in
-- lib/preferences.ts still has to match it; tests/preferences.test.ts holds it.
--
-- Shape: **additive in effect.** A new column with a default, so no existing
-- row is read or written differently. The index swap loosens a constraint and
-- drops no data; code from before this migration reads and writes the table
-- exactly as it did (it finds a phrase's first row). Undoing it means
-- recreating `brand_preferences_phrase_key`, which fails once a phrase holds two
-- products — forget the extras in Your brands first.

alter table cookbook.brand_preferences
  add column tally integer not null default 0 check (tally >= 0);

create unique index brand_preferences_phrase_product_key
  on cookbook.brand_preferences (lower(regexp_replace(btrim(phrase), '\s+', ' ', 'g')), url)
  where kind = 'product';

create unique index brand_preferences_phrase_words_key
  on cookbook.brand_preferences (lower(regexp_replace(btrim(phrase), '\s+', ' ', 'g')))
  where kind <> 'product';

drop index cookbook.brand_preferences_phrase_key;

notify pgrst, 'reload schema';
