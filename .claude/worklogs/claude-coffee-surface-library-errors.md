# claude-coffee-surface-library-errors
agent: Coffee · apps: apps/coffee · shared files: none

## 2026-09-12 19:30 — claim
Working on: stop the library rendering "No bags yet" when the load failed, and fix the search term that caused it
Touching: apps/coffee/{lib/bags.ts,app/api/bags/route.ts,app/page.tsx,tests/bags.test.ts}
Depends on: nothing

## 2026-09-12 19:38 — handoff
Landed: `GET /api/bags` failures are surfaced in the library rather than swallowed, and search terms
are quoted for PostgREST so a comma or a parenthesis no longer produces a 500. Tests 33 → 38.
Open: the 500 Joel hit at 19:10 is not confirmed as the comma case — he has a search box and did not
say whether he had typed in it. Both fixes are correct regardless, and after this the app names its
own error instead of an agent guessing at it.
Need from TD: nothing.
