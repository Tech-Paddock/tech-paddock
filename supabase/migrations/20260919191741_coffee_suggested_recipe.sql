-- Coffee: a recipe Claude suggested, when the roaster published none.
--
-- The whole point of this tool is retrieving what the roaster actually
-- published, and `guide_*` means exactly that: a value with a verbatim quote
-- and the URL it was read on behind it. A suggestion has neither and never
-- will, so it does not go anywhere near those columns. It gets its own,
-- prefixed so that no query, no view and no later migration can confuse the
-- two, and so that "what did the roaster say" stays answerable by reading
-- `guide_*` alone.
--
-- One jsonb column rather than seven, because a suggestion is one artifact
-- produced in one call by one model: the parameters, the reasoning, the model
-- that produced it and when. Nothing here is ever queried per-parameter — the
-- question is only ever "is there a suggestion on this bag" — and splitting it
-- would invite exactly the guide_*-shaped comparison the separation exists to
-- prevent.
--
-- Additive, so it rides with its code: the database sitting ahead of the app
-- is harmless, and a bag with no suggestion is the same null it was before.

alter table coffee.bags
  -- {method, ratio, dose, water, temp, grind, time, rationale, model,
  --  generated_at}. Null means none was ever generated, which is the normal
  -- state for every bag whose roaster did publish a recipe.
  add column suggested_recipe jsonb,
  -- A generation that was attempted and failed, recorded for the same reason
  -- guide_search_error is: a bag that silently has no suggestion and a bag
  -- whose suggestion errored are the same null, and only one of them is an
  -- answer.
  add column suggested_error  text;
