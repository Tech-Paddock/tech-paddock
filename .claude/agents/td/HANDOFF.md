# Technical Director — handoff

State as of 2026-09-20, written as a handover to a new session of this seat. `RULES.md` has the
role and the gate; this is only what is true right now.

---

## In flight

**#159, #160 and #162 are merged**; `main` carries the Cookbook, the ledger work and the board
change. **The Cookbook is deployed and does not work yet** — `tp-cookbook` built on the merge, and
every read 503s until item 27 is done. That is Joel's and it is minutes.

**#161 (Coffee) is gated and passes.** `apps/coffee`, its own two documents, one additive migration,
no shared file. **Its migration is applied and read back**, recorded under the version its filename
declares. **It was written under the old charter rule and edits its own `RULES.md`, so it merges
BEFORE the caps branch**, which takes that right away.

**`claude/brief-doc-caps` is finished and pushed** — every document capped, the limit-handling rule,
and charters becoming the technical director's to draft.

## What is true now

**Consumption was this session's real finding.** 30 sessions read ~$7.4K of list-price value — **not
a bill**, but 8 hit the seven-day warning and **one immortal session was 58%** of it. **Cost ≈
context × tool calls**: 10.3B of 10.5B tokens are re-reads. **Batch calls, group gates, end a
session at its branch.**

**Joel's model, and it is right: a session is a branch off `main`; the agent is the owner.** Cut it
from the docs, do one change, merge via handoff and ledger, **close it**. It predicts the duplicate-27
collision here. **Wants a `DECISIONS.md` row once he confirms** — his call, so not written yet.

**Charters are yours to draft as of 2026-09-20, Joel's to approve**; `HANDOFF.md` did not move.
**Every document is capped**, with a table in `CLAUDE.md` for what to do at one. **Caps are ratchets
at today's size** — `CLAUDE.md`'s 400 arrives with the compaction, since a cap below its file is a
red `main`. **That compaction is deliberately not this session's**: an agent holding the whole file's
reasoning cannot judge whether a compacted line still carries it. A cold session is the test.

**The board is regenerated, never adopted** — reading one back to edit it cost ~38K tokens resident
for the rest of the session against ~9K to build it. **Publish once per session, at close-out.**

**The doc floor is the checkout, not overhead**, and **regressive** — 5% of a 600K session, 46% of a
75K one. **`### Always` is 55% of `CLAUDE.md`**, the sign-off spec 34%; the compaction lives there.

**The ledger is 80/80 and cannot record the work that would give it room** — item 28, the
`CLAUDE.md` compaction, has no line to sit on. That is the demonstration, not untidiness.

**The read-back rule has its proof, twice.** **MCP `apply_migration` cannot record a file's own
version** — name and query only, and it stamps the clock. Use `execute_sql` with the DDL and the
`supabase_migrations.schema_migrations` insert **in one batch**. **Item 26's three are unchanged.**

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

**Joel's, minutes each**: **item 27** — three env vars, exposed schemas, redeploy.
**Item 1** is the lockout counter, one edit plus a restamp. **22 and 23** are one conversation.

**Do not inherit as measured:** anything behind `techpaddock.io` or a `*.vercel.app` host — every
claim about a live page here is a Vercel API reading, never an HTTP response.
