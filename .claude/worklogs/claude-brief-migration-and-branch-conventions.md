# claude-brief-migration-and-branch-conventions
agent: technical director · apps: none · shared files: CLAUDE.md, supabase/README.md
authorized by: Joel, directly, in session — the four migration-shape bullets quoted back with
"do it", "Leave claude but also require area … i just need to know area and description", "its live"
for the domain map, and "fix what you need to fix in the order it needs to be done"

## 2026-09-14 23:20 — claim
Working on: the conventions Joel settled today — migration shape, branch naming, the domain map row,
and the migration version drift.
Touching: CLAUDE.md, supabase/README.md, four migration filenames, the ledger, the TD handoff.
Depends on: nothing. No app code, no schema change, no live database write.

## 2026-09-14 23:20 — the version drift had a third option, and it is better than both I offered

I put two choices to Joel: repair the remote versions to match the filenames, or leave them and
amend the README to promise five discrepancies instead of one. He said fix it in the order it needs
doing, which reads as authorization for the first.

**I took neither.** The four files are renamed to the versions that actually ran.

The reasoning is the part worth keeping. This directory exists so the database stops being the only
record of its own shape — but that does not make the repo the authority on *what already happened*.
The database is the record of what ran and when; the repo is the record of what was intended. When
they disagree about history, history wins and the cheap side moves. Renaming four files is the cheap
side. Editing `supabase_migrations.schema_migrations` is rewriting the record of the past to match a
document written after it.

Three things fall out of that:

- **`supabase migration repair` was never needed**, which matters because the brief forbids it. I
  had flagged that ban as written for a different case and arguably not applying here, and I would
  have needed Joel to lift it. A rule I was preparing to argue around turned out not to be in the
  way. Worth noticing how close that came to being an argument instead of a check.
- **No live database write at all.** The fix is four `git mv`s.
- **`supabase db push` is safe again.** It compares filename versions against remote versions; with
  the four renamed they read as applied rather than as four unapplied migrations that would each
  error on `add column`.

Verified before renaming rather than after: the SQL recorded remotely is identical to the files,
statement by statement, for all four. The hosted API strips the leading comment block, so the
reasoning for each migration exists only in this repo. Local and remote histories now differ by
exactly one version — `20260908235234`, the withheld contacts seed — which is what the README has
promised all along and has not been true since 2026-09-11.

## 2026-09-14 23:20 — what went into the brief

**The migration shape rule.** Joel quoted the four bullets back and said do it, so they are in
`CLAUDE.md` as written, with one addition he did not ask for and I think earns its place: the case
it is written against. `20260912213501` dropped four columns alongside the code that stopped using
them, and it went out safely only because I queried the live table by hand first and found them
empty. A rule with its own incident attached is harder to talk past than a rule stated as a
principle, and this project's failures are all failures of talking past.

**Branch naming.** `claude/<area>-<description>`. Joel kept the `claude/` prefix and asked only that
area and description be legible; everything after that he called irrelevant, so the rule says so
explicitly rather than leaving a gap someone fills with ceremony.

**The domain map.** Coffee reads `live`. Joel said "its live" — that is the authorization, and the
row has been wrong for two days.

## 2026-09-14 23:20 — handoff
Landed on the branch, no pull request: the migration shape rule and the branch-naming rule in
`CLAUDE.md`, the domain map corrected, four migrations renamed to the versions that ran, and
`supabase/README.md` recording why the rename went in that direction.
Open: Joel's history rewrite decision is authorized but not started — it cannot run while #56 is
open and it needs branch protection relaxed, so it is sequenced after that merge, not before.
Need from TD: nothing, this is the TD.
