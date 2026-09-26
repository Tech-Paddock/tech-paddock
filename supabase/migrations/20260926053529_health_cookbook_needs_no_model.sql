-- A `cookbook` number names no model, as a `hand` number names none.
--
-- TEC-25, the second half of `health_macro_source_cookbook`, which added the
-- enum value and must be applied first — the value cannot be used in the
-- transaction that adds it, so the two are separate files.
--
-- `model_matches_source` on `health.item_versions` said a non-`hand` number
-- must name the model that produced it. That is still the rule for `web` and
-- `estimate`. A Cookbook recipe's numbers are the Cookbook's own — the contract
-- returns no model, and inventing one would be a provenance that lies — so
-- `cookbook` joins `hand` on the side that names none.
--
-- **Shape: additive.** The constraint is replaced by a strictly looser one:
-- every row the old one allowed, the new one allows, so every existing row
-- satisfies it, and the code running now never writes `cookbook`. The drop and
-- the add run in one transaction, so there is no moment without the check.
--
-- ## RLS
--
-- A constraint on an existing table: RLS is already enabled on it with zero
-- policies, and nothing here changes that.

alter table health.item_versions
  drop constraint model_matches_source,
  add constraint model_matches_source check (
    (source in ('hand', 'cookbook') and model is null)
    or
    (source not in ('hand', 'cookbook') and model is not null)
  );

notify pgrst, 'reload schema';
