# Technical Director — handoff

State as of 2026-09-24. `RULES.md` has the role and the gate, `DECISIONS.md` the reasoning; this is
only what is true once the post-review branches have merged.

---

**Branch and pull request state is never written here** — read it live: `git ls-remote --heads
origin`, the open pull request list, check runs on the head SHA. Open work is in Linear, team TEC.

## Where the work is

**TEC-27 is the post-refactor review of 2026-09-24**, with one sub-issue per owner (TEC-28 to 33):
the full findings, file:line, in the order each agent should work them. Joel's dashboard steps are
TEC-33. **The Next.js 14 → 16 upgrade is TEC-34** — 14.2.35 is the last 14.x; start its spike once
the review's TD branches have merged. **TEC-7 waits on Joel's A/B** (firewall rate limit or a
per-IP table); the lockout cookie is advisory until then and the code says so.

**Joel's calls on 2026-09-24**, all in `DECISIONS.md`: the tracker is parked and he pauses
`tp-tracker` once the review work lands; the editor was resumed only to take the login fix and goes
back to paused; TEC-21 is go; Coffee's "Search again" keeps only the freshest result; the charter
cap is 350.

## What the review branches left behind

- **Login.** `from` is followed only when it is a path on the same origin (`lib/safe-redirect.ts`);
  the login handler is one stamped file (`lib/login.ts`); middleware exceptions are exact paths; the
  tracker's `/api/cron/*` needs the `CRON_SECRET` bearer at the gate as well as in the route; the
  attempts cookie is unsigned (it was a free signed sample of `SESSION_SECRET`).
- **Enforcement.** The hooks and `drift` are as `CLAUDE.md`'s *What is actually enforced* says —
  including the hook that asks Joel before any Vercel or Supabase write that is his.
- **Database.** A rebuild from `supabase/` now gets the original four tables' grants
  (`record_original_table_grants`). The recorded version is whatever the hosted API stamped when it
  was applied at the gate — rename the file to match before merging, as `supabase/README.md` says.
- **The weekly Routine** "Weekly rules-drift audit" (Mondays 08:00 UTC, report-only) had a prompt
  from before Linear and before `drift` measured most of what it asked for. Rewritten 2026-09-24 to
  read Linear, run `drift`, and report only.

## Traps only here

- **`INTERNAL_API_SECRET` is one secret for two callers** (hub → tracker, tracker → editor), and on
  `tp-tracker` it is *sensitive* — Vercel will not show it again. TEC-8's fix is copying the existing
  value to `tp-home`, never minting a new one while the editor is paused.
- **A project env read cannot see team-shared variables.** `tp-home` showed only `GITHUB_TOKEN` and
  `VERCEL_TOKEN` at project scope; `SESSION_SECRET` and `APP_PASSWORD_HASH` must be shared ones.
- **The hub holds `GITHUB_TOKEN` and `VERCEL_TOKEN`** for the Pit Wall's reads — the most powerful
  credentials in the estate, on the app that holds no database key. TEC-32 item 4 and TEC-33 step 5
  are how that shrinks.
- **The Vercel connector lists write tools. Do not use them** — Joel, 2026-09-23: "follow charter".
  The hook now asks him before each; hand him the step instead.
- **Spawning an agent's session from here works** (`create_session`, with `outcome_branch`), but
  `CLAUDE.md` says agents never run at the same time and `KICKOFF.md` has them wait for Joel before
  branching. **Do not spawn one until Joel sanctions it.** Subagents inside this session, each in its
  own worktree, are fine and are how the review branches were built.
- **A helper session can be refused a `git commit` the parent is allowed** — the permission system
  decides per session. When that happens, take it to Joel; never re-run the refused action from here.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **A pull request body is a claim, not evidence** — read Vercel and Supabase live before repeating
  its deployment steps to Joel.
- **Building the hub locally rewrites three tracked `apps/home/lib/*.generated.ts` files.** Restore
  them before committing anything; TEC-32 item 6 ends it.
- **Build in a worktree, never the main checkout**, when anything else is reading the repo.
- **Cost is context × turns.** One session, one branch, end it — a review session that fans out to
  worktree subagents is the exception, and it should still end once the branches are pushed.
- **Six "Close out —" Routines from 2026-09-19 are still listed** — fired one-shots with nothing
  left to do. Delete them when Joel agrees.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
