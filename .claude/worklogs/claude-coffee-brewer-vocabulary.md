# claude-coffee-brewer-vocabulary
agent: Coffee · apps: apps/coffee · shared files: none

## 2026-09-12 20:45 — claim
Working on: split the brew vocabulary into the roaster's and mine
Touching: apps/coffee/lib/{brewers.ts,methods.ts}, apps/coffee/tests/brewers.test.ts
Depends on: nothing — first of three branches split out of the bag-form work

## 2026-09-12 20:45 — handoff
Landed: `lib/brewers.ts` holds both vocabularies; `normalizeMethod` learned Origami. No UI change
and no schema change — `BREW_METHODS` and `METHOD_LABELS` still export from `lib/methods.ts`, so
nothing that consumes them had to move. Tests 38 → 47.
Open: nothing. The two branches that build on this carry the UI and the schema.
Need from TD: nothing.
