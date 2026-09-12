# claude-coffee-background-the-search
agent: Coffee · apps: apps/coffee · shared files: none

## 2026-09-12 03:05 — claim
Working on: background the brew-guide search and make the search model selectable
Touching: apps/coffee/{lib/anthropic.ts,lib/models.ts,lib/bags.ts,app/page.tsx,app/api/search/route.ts,app/api/bags/route.ts}, supabase/migrations/20260912031500_coffee_background_search.sql
Depends on: branch claude/coffee-surface-database-errors, which this is cut from and which is unmerged

Agreed with Joel after Coffee's first live run: the search took long enough that the phone
dropped the connection and showed "load failed" on a request the server completed with a 200.

## 2026-09-12 03:16 — decisions other agents should know
Two things here need someone else:

1. **`CLAUDE.md` pins `claude-sonnet-5`** as the stack model (line 179). The search is now
   selectable across Haiku 4.5 / Sonnet 4.6 / Sonnet 5 and defaults to Haiku. Joel is having the
   TD make an explicit exception; I have not touched `CLAUDE.md`. **If that exception is not
   granted, this branch should not merge as-is.**
2. **The charter's flow says search then save.** It is now save then search, because the answer
   has to have a row to land in. `guide_status: 'not_searched'` was already documented as "for a
   bag saved before any search ran", so the schema anticipated this. The charter amendment is in
   this pull request rather than made unilaterally.

Not done, and deliberately: seeding Denver roaster domains. Roaster domains are blocked by the
sandbox egress proxy, so no agent here can verify one — it would produce a list from model memory,
which is the exact guess `findRoasterDomain` exists to refuse. If it happens it needs its own
table, its own branch, and verification through the deployed app where web_fetch has real egress.

## 2026-09-12 03:16 — handoff
Landed: search runs against a saved row and writes its answer there; the page polls instead of
waiting. Model picker on the confirm screen, backed by a registry that carries each model's tool
versions. Tests 23 → 30, build clean.
Open: unverified against a live deploy. The model comparison is the point and has not started.
Need from TD: the `CLAUDE.md` model exception, and a view on the charter amendment.
