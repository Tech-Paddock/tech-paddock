# claude-coffee-brew-log
agent: Coffee · apps: apps/coffee · shared files: none

## 2026-09-12 20:48 — claim
Working on: move the dial-in off the bag into a one-to-many brew log, with TDS and extraction yield
Touching: apps/coffee/{lib/brews.ts,lib/bags.ts,app/page.tsx,app/api/bags/route.ts,app/api/bags/[id]/route.ts,app/api/bags/[id]/brews/route.ts,app/api/brews/[id]/route.ts}, supabase/migrations/20260912200000_coffee_brews_shelf_and_bag_fields.sql
Depends on: claude/coffee-page-shell-and-delete, which this is cut from

## 2026-09-12 20:48 — decision another agent should know
**TDS is stored once, in percent, and `extraction_yield` is a generated column.** Both are the same
rule: one measurement, one record of it. ppm is derived at display and the API refuses an
extraction_yield sent by a client. If a later change makes either writable, that is the thing to
argue about rather than the thing to quietly allow.

Dropping the bag's dial-in columns is lossless — across all three bags the only value ever set was
a single `my_method` of 'other'.

## 2026-09-12 20:48 — handoff
Landed: `coffee.brews`, the brews panel on a bag, TDS in both units with a live extraction readout
and the measuring notes in the form. Deleting a bag cascades to its brews and the confirm names the
count. Tests 47 → 56.
Open: unproven against the deployed app. The migration has not been applied anywhere.
Need from TD: nothing.
