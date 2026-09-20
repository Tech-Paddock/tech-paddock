# Technical Director — handoff

State as of 2026-09-20, written as a handover to a new session of this seat. `RULES.md` has the
role and the gate; this is only what is true right now.

---

## In flight

**#159 through #163 are merged and `main` is at `68ffc52`** — the Cookbook, Coffee's brew time, the
board, every document capped, and charters becoming yours to draft. **No pull request is open.**

**`claude/brief-drop-compaction` is pushed and green at `371af90`, with no pull request** — Joel has
not asked. It takes the compaction ritual out of `CLAUDE.md` and every kickoff block and **keeps the
summary-of-a-summary reasoning**, re-pointed at the gap between sessions rather than deleted.

## What is true now

**A bare Redeploy cannot build here — the ignore step is a pure function of `HEAD^..HEAD`.**
Since 2026-09-20 every `ignoreCommand` reads `FORCE_BUILD`: set it on the Vercel project, redeploy,
remove it. It is read **after the preview check**, so previews stay ruled out. The warn band moved
200 → 235 to pay for it; the hard fail at 256 is the real guard. `DECISIONS.md` has the cost.

**Consumption was the session-before-last's real finding.** 30 sessions read ~$7.4K of list-price
value — **not a bill**, but 8 hit the seven-day warning and **one immortal session was 58%** of it.
**Cost ≈ context × tool calls**: 10.3B of 10.5B tokens are re-reads. **Batch calls, group gates, end
a session at its branch.** Joel's model, and it is right: **a session is a branch off `main`.**

**Charters are yours to draft as of 2026-09-20, Joel's to approve**; `HANDOFF.md` did not move.
**Every document is capped**, with a table in `CLAUDE.md` for what to do at one. **Caps are ratchets
at today's size** — `CLAUDE.md`'s 400 arrives with the compaction. **That compaction is deliberately
not this seat's while it holds the file's reasoning**: a cold session is the test.

**The board is regenerated, never adopted** — reading one back to edit it cost ~38K tokens resident
for the rest of the session against ~9K to build it. **Publish once per session, at close-out.**

**The doc floor is the checkout, not overhead**, and **regressive** — 5% of a 600K session, 46% of a
75K one. **`### Always` is 55% of `CLAUDE.md`**, the sign-off spec 34%; the compaction lives there.

**The ledger is 80/80 and cannot record the work that would give it room.** That is the
demonstration, not untidiness.

**The read-back rule has its proof, twice.** **MCP `apply_migration` cannot record a file's own
version** — name and query only, and it stamps the clock. Use `execute_sql` with the DDL and the
`supabase_migrations.schema_migrations` insert **in one batch**. **Item 26's three are unchanged.**

**Branch protection and `Require branches to be up to date` are on; required checks are `gate`,
`drift`, `requested-by-joel`** — Joel's screenshot, not a measurement. Say which it is.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge**, never from memory.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **A project env read cannot see shared variables.** I reported `SESSION_SECRET` and
  `APP_PASSWORD_HASH` missing from `tp-cookbook`; `tp-coffee-app` returns the same three keys while
  live and gated. **The absence was the instrument, not the project.** Confirm shared vars with Joel.
- **You cannot delete a remote branch** — the proxy refuses both routes. `DECISIONS.md` has it.
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

**Joel's, minutes**: **item 27** is now `cookbook` on Supabase's exposed-schemas list, plus a build.
**Item 1** is the lockout counter, one edit plus a restamp. **22 and 23** are one conversation.

**Do not inherit as measured:** anything behind `techpaddock.io` or a `*.vercel.app` host — every
claim about a live page here is a Vercel API reading, never an HTTP response. Both domains returned
`HTTP 000` from this container on 2026-09-20: the proxy, not the apps.
