# claude-coffee-surface-database-errors
agent: Coffee · apps: apps/coffee · shared files: none

## 2026-09-12 02:50 — claim
Working on: stop `lib/bags.ts` reporting success when a Supabase query fails
Touching: apps/coffee/lib/bags.ts, apps/coffee/tests/bags.test.ts
Depends on: nothing

Found while debugging the first live run of Coffee tonight. `findPreviousBag` and
`findRoasterDomain` both destructure only `{ data }` from the Supabase result and discard
`error`, so an unreachable database returns `null` and is indistinguishable from "no previous
purchase" and "no verified domain yet". Both are legitimate answers, which is exactly why the
failure hid.

The visible cost: with `coffee` unreachable from the Data API, `POST /api/search` returned 200
having searched unpinned, and `GET /api/bags?roaster=&coffee_name=` returned 200 reporting no
previous bag. Only the library list — the one path that checks `error` — returned 500. Two of
three call sites lied, and the debugging went to the Anthropic key first because of it.

Deliberately NOT in this branch: the `coffee` schema is very likely missing from the hosted
Supabase project's exposed-schemas list (`supabase/config.toml` lists it, but that governs a
local stack only). That is a dashboard setting, not repo state, and it is Joel's to change. This
branch only makes the failure legible.

## 2026-09-12 02:57 — handoff
Landed: both lookups throw `LookupError` on a Supabase error instead of returning null; the
previous-purchase branch of `GET /api/bags` gained the try/catch it never had, so the message
reaches the browser rather than an opaque 500. Tests 16 → 23, build clean.
Open: the `coffee` schema still appears to be unreachable from the Data API. This branch does not
fix that and cannot — see the claim entry.
Need from TD: nothing. Joel to confirm the exposed-schemas setting.
