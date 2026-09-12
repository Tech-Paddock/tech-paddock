-- Background the brew-guide search.
--
-- The search is one long request: the model runs several web searches and
-- reads real roaster pages, which takes anywhere from thirty seconds to a few
-- minutes. Nothing arrives on the connection while it works, so a phone
-- decides the request is dead and the answer is lost even though the server
-- finished it. That happened on Coffee's first live run.
--
-- The fix is to stop the answer travelling in the response. The bag row is
-- written first, the search updates it when it lands, and the page polls the
-- row. A dropped connection then costs nothing.
--
-- guide_status already had 'not_searched' for exactly this case — a bag saved
-- before any search ran — so the in-flight and failed states are all that were
-- missing.

alter table coffee.bags
  add column guide_search_started_at timestamptz,
  add column guide_search_error      text,
  add column guide_model             text,
  add column guide_dropped           jsonb not null default '[]'::jsonb;

comment on column coffee.bags.guide_search_started_at is
  'Set when a search begins, cleared when it lands. Non-null with guide_status ''not_searched'' means in flight.';

comment on column coffee.bags.guide_search_error is
  'Why the last search could not answer. A recorded failure, as against ''none'', which is an answer.';

comment on column coffee.bags.guide_model is
  'Which model produced this guide. The search model is selectable while its retrieval quality is being compared, and a guide is only comparable against another if you know what answered.';

comment on column coffee.bags.guide_dropped is
  'Values the model asserted but could not back with a quote. Previously these lived only in the search response; with the search backgrounded they have to be stored, or a value dropped for having no source would be silently discarded rather than shown next to what was kept.';
