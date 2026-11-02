-- The search model is no longer selectable: every call uses the one model set in
-- apps/coffee/lib/models.ts (TEC-133). The column still records what answered.
-- Comment only; additive, no data or shape change.

comment on column coffee.bags.guide_model is
  'Which model produced this guide, as recorded by the search. The model is fixed per app in lib/models.ts and not selectable; bags searched before that keep the model that answered them, so a guide is only comparable against another if you know what answered.';
