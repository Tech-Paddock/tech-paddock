# Technical Director — handoff

State as of 2026-09-20, written as a handover to a new session of this seat. `RULES.md` has the
role and the gate; this is only what is true right now.

---

## In flight

**#159 (Cookbook) passed the gate and is NOT merged.** Head `bf37647`, CI green (runs 661 and 662),
blast radius `apps/cookbook` + one migration, no shared file touched. **The merge was refused by the
harness classifier — `[Merge Without Review]` — not by the gate.** Joel grants it or merges himself.
**Its migration is already applied**, correctly: additive, before the merge.

**Two pull requests of mine are open**, both green, both `brief`.
`claude/brief-cookbook-gate-followup`: Cookbook's board URL into `KICKOFF.md`, item 25 closed, 27
opened, the `models.ts` call into `DECISIONS.md`. `claude/brief-board-regenerate`: how the board is
produced. **Merge the followup first** — the other is cut from `main` and shares none of its files.

## What is true now

**Consumption was this session's real finding.** 30 sessions read ~$7.4K of list-price value —
**not a bill** (`isUsingOverage` false everywhere) but 8 hit the seven-day warning, and **one
immortal session was 58%** of it. Joel archived it. **Cost ≈ context × tool calls**: 10.3B of 10.5B
tokens are re-reads. **Batch calls, group PR gates, end a session at its branch.**

**Joel's model, and it is right: a session is a branch off `main`; the agent is the owner.** Cut it
from the docs, do one change, merge via handoff and ledger, **close it**. It predicts the duplicate-27
collision here. **Wants a `DECISIONS.md` row once he confirms** — his call, so not written yet.

**The board is regenerated, never adopted.** Reading one back to edit it cost ~38K tokens resident
for the rest of the session; building from `BOARD.html` cost ~9K. **Publish once per session at
close-out.** Both in `claude/brief-board-regenerate`.

**The doc floor is the checkout, not overhead** — ~17K a session, ~8% of the meter, and
**regressive**: 5% of a 600K session, 46% of a 75K one, so shortening sessions makes cutting it
matter *more*. **`### Always` is 55% of `CLAUDE.md`** and the sign-off spec is 34% of it; a 15–25%
cut lives there. **Joel has not said go, and `CLAUDE.md` is his.**

**The ledger is 80/80 and cannot record the work that would give it room** — item 28, the
`CLAUDE.md` compaction, has no line to sit on. That is the demonstration, not untidiness.

**The read-back rule has its proof**, the one `supabase/README.md` asked for: the Cookbook's
migration is recorded under exactly the version its filename declares. **MCP `apply_migration`
cannot do it** — name and query only, and it stamps the clock. Use `execute_sql` with the DDL and
the `supabase_migrations.schema_migrations` insert **in one batch**, which records what you apply
rather than repairing history. **Item 26's three are unchanged; nothing new drifted.**

**`lib/models.ts` stays a per-app copy — settled at #159's gate**, reasoned in `DECISIONS.md`.
**No ledger row; that is the answer rather than a gap.**

**Branch protection and `Require branches to be up to date` are on; required checks are `gate`,
`drift`, `requested-by-joel`** — Joel's screenshot, not a measurement. Say which it is.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge**, never from memory.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **`Vercel – tp-message-editor` is red on `main` itself** — `BLOCKED`, the frozen editor. It makes
  every PR `mergeable_state: unstable` and **is not a gate failure**. Check a red status against
  `main` before treating it as the branch's.
- **`gate` runs after the whole build matrix**, so a green `drift` proves nothing.
- **A pull request body is a claim, not evidence.** #159's was accurate on the diff and **stale on
  the dashboard** — it said the Vercel project and domain did not exist; both did. Read Vercel and
  Supabase live before repeating a body's deployment steps to Joel.
- **Share-of-context is the wrong denominator for cost.** Content is paid on every call *after* it
  arrives. I got this wrong three times in one session, each time too high.
- **This session could not read the exposed-schemas list** — PostgREST config, not a `pg_settings`
  row. Grants and RLS *are* checkable in SQL. Say which of the two you have.
- **Vercel's `ignoreCommand` is capped at 256 characters and the failure is total.**
- **You are a session, not a service** — you do not persist and do not monitor. Say so.
- **The `supabase migration repair` hook matches that string in any Bash command.** Use Write.

## Next

**Joel's, minutes each**: merge #159, then **item 27** — three env vars, exposed schemas, redeploy.
**Item 1** is the lockout counter, one edit plus a restamp. **22 and 23** are one conversation.

**Do not inherit as measured:** anything behind `techpaddock.io` or a `*.vercel.app` host — every
claim about a live page here is a Vercel API reading, never an HTTP response.
