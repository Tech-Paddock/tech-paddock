# Technical Director — handoff

State as of 2026-09-20, written as a handover to a new session of this seat. `RULES.md` has the
role and the gate; this is only what is true right now.

---

## In flight

**#159 (Cookbook) passed the gate and is NOT merged.** Head `bf37647`, CI green on it (runs 661
*and* 662), blast radius `apps/cookbook` + one migration, no shared file touched. **The merge was
refused by the harness permission classifier — `[Merge Without Review]` — not by the gate.** Nothing
is wrong with the change. Joel grants the permission or merges it himself. **Re-read the head SHA
and the open list before merging; do not re-run the whole gate on a whim.**

**Its migration is already applied** — correct: additive, before the merge, per `CLAUDE.md`. The
database is ahead of the code, which is the safe direction. If #159 is abandoned, two empty tables
in `cookbook` are the only residue.

**`claude/brief-cookbook-gate-followup` is pushed and finished** — Cookbook's board URL into
`KICKOFF.md`, item 25 closed, 27 opened, the `models.ts` call into `DECISIONS.md`. **No pull
request: Joel has not asked for one.**

## What is true now

**The read-back rule now has its proof, and it is the preferred one.** `supabase/README.md` calls
recording the file's own version at apply time **preferred, "to be proven on the next migration
applied"** — done, and the Cookbook's migration is recorded under exactly the version its filename
declares. **MCP `apply_migration` cannot do it**: name and query only, and it stamps the clock. Use
`execute_sql` with the DDL and the `supabase_migrations.schema_migrations` insert **in one statement
batch**, so they are one transaction. That is recording what you apply, not repairing history, which
is why it is allowed where editing a version afterwards is not.

**Item 26's three are unchanged and now measured** — the ledger names them, so this does not.
Local and remote differ by those three plus the deliberate remote-only seed. **Nothing new drifted.**

**`lib/models.ts` stays a per-app copy — settled at #159's gate**, in `DECISIONS.md`: three copies,
76/67/61 lines, none alike, where `packages/shared` means byte-identical. **No row; that is the answer.**

**`packages/shared` is the one real copy** of `auth.ts`, `password.ts`, `theme.css`, `theme.ts` and
`next.config.mjs`; `drift` fails a copy that disagrees. **Edit canonical and restamp, never a copy.**

**Previews are off and `On track` does not exist** — three phrases, five stages. Joel's call on 2026-09-20; read its `DECISIONS.md` entry before rebuilding it.

**Publish only your own board**; a merge leaves the merged agent's alone, stale or not. Board URLs
live in `KICKOFF.md` and nowhere else, and **Cookbook's is no longer blank** — seeded by this seat,
its Work Brief deliberately `- None.`, because nobody else can write another agent's.

**Branch protection is on**, **`Require branches to be up to date` is on**, and the required checks
are **`gate`, `drift`, `requested-by-joel`** — Joel's screenshot, not a measurement, as no agent can
read rulesets. Say which it is when you repeat it.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge**, never from memory.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **`Vercel – tp-message-editor` is red on `main` itself** — `BLOCKED`, the frozen editor. It makes
  every PR `mergeable_state: unstable` and **is not a gate failure**. Check a red status against
  `main` before treating it as the branch's.
- **`gate` runs after the whole build matrix**, so a green `drift` proves nothing.
- **A pull request body is a claim, not evidence.** #159's was accurate on the diff and **stale on
  the dashboard** — it said the Vercel project and the domain did not exist; both did. Read Vercel
  and Supabase live before repeating a body's deployment steps to Joel.
- **This session could not read `postgrest_logs`** (classifier refused) and **cannot read the
  exposed-schemas list at all** — PostgREST config, not a `pg_settings` row. Grants and RLS *are*
  checkable in SQL. Say which of the two you have.
- **Vercel's `ignoreCommand` is capped at 256 characters and the failure is total.**
- **A dry-run merge on a dirty tree proves nothing.** Commit, then dry-run.
- **`live: false` on a Vercel project does not mean paused.** Read deployment state.
- **You are a session, not a service** — you do not persist and do not monitor. Say so.
- **The `supabase migration repair` hook matches that string in any Bash command.** Use Write.

## Next

**Item 27 is Joel's and it is minutes** — three env vars, exposed schemas, redeploy. **Item 1** is
the lockout counter, one edit plus a restamp now `packages/shared` exists. **Items 22 and 23** are
the Cookbook pair and are one conversation. **Item 20** is a `drift` rule.

**Do not inherit as measured:** anything behind `techpaddock.io` or a `*.vercel.app` host — every
claim about a live page here is a Vercel API reading, never an HTTP response.
