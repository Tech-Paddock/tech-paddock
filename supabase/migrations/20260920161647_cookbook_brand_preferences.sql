-- Cookbook · remembered brands for the shopping list
--
-- The link beside a grocery line is a King Soopers search built from the line's
-- own name. That is right for a line you have no opinion about and wrong for the
-- ones you buy the same way every week. This table holds the opinions.
--
-- **Three shapes, because "no brand" is a real answer.** A preference is a
-- product link, better search words, or deliberately nothing. The third is not a
-- missing row: it is how a narrow phrase overrides a broad one. Joel's own
-- example is exactly this — `milk` means Fairlife 2%, and `whole milk` means
-- plain whole milk, which only works if `whole milk` can be written down as
-- "search this plainly" rather than left out.
--
-- **The rows are the user's shopping, and they do not belong in git.** This
-- migration creates the table and seeds nothing. The rows arrive through the app
-- at runtime, which is a deliberate departure from how this repo usually likes
-- data to be reproducible: `CLAUDE.md` forbids committing personal information,
-- and a year of buying habits is that. The schema is the record here; the
-- contents are not.
--
-- Shape: **additive**. A new type, a new table, a new index. Nothing existing is
-- read or written differently until the code that queries it ships, so the
-- database sitting ahead of the code is harmless.

create type cookbook.preference_kind as enum ('product', 'terms', 'plain');

create table cookbook.brand_preferences (
  id uuid primary key default gen_random_uuid(),

  -- What has to appear in a grocery line for this preference to apply. Written at
  -- the level you shop at — `milk`, `cheddar` — never at the level a receipt
  -- prints, because a phrase carrying a package size stops matching the moment
  -- you buy a different tin.
  phrase text not null check (length(trim(phrase)) > 0),

  kind cookbook.preference_kind not null,

  -- A product page you pasted. Never built here and never verified here: no
  -- session in this repo can reach kingsoopers.com, so a URL is taken on trust
  -- and `terms` is what survives if it ever rots.
  url text,

  -- What to search instead of the line's own name.
  terms text,

  -- Provenance, and the only reason a row is legible six months later: which
  -- brand this is, and where the preference came from — a receipt, or a tap.
  brand text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The payload has to match the shape, or a 'plain' row quietly carrying a URL
  -- would send you to a brand you explicitly said you did not want.
  constraint preference_payload_matches_kind check (
    (kind = 'product' and url is not null and length(trim(url)) > 0) or
    (kind = 'terms' and url is null and terms is not null and length(trim(terms)) > 0) or
    (kind = 'plain' and url is null and terms is null)
  )
);

-- One preference per phrase, refused by the database rather than by a lookup —
-- the same rule and the same normalisation as `recipes_name_key`, so a second
-- `Milk ` cannot shadow the first. `normalizePhrase` in lib/preferences.ts must
-- match this expression exactly; tests/preferences.test.ts is what holds them
-- in step.
create unique index brand_preferences_phrase_key
  on cookbook.brand_preferences (lower(regexp_replace(btrim(phrase), '\s+', ' ', 'g')));

-- The whole table is read on every list render and matched in code: longest
-- phrase wins, and the most recently updated row breaks a tie. Hundreds of rows
-- is tens of kilobytes, so this index is for the tie-break ordering rather than
-- for any filtering.
create index brand_preferences_recent_idx on cookbook.brand_preferences (updated_at desc);

alter table cookbook.brand_preferences enable row level security;

notify pgrst, 'reload schema';
