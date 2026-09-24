# Technical Director — handoff

State as of 2026-09-24. `RULES.md` has the role and the gate, `DECISIONS.md` the reasoning; this is
only what is true once the post-review branches have merged. State and traps only — open work is in
Linear, team TEC.

---

**Branch and pull request state is never written here** — read it live: `git ls-remote --heads
origin`, the open pull request list, check runs on the head SHA.

## Where the work is

**TEC-27 is the post-refactor review of 2026-09-24**: one sub-issue per owner (TEC-28 to 32), Joel's
dashboard steps (TEC-33) and the hooks (TEC-35). **TEC-34 is the Next.js 14 → 16 upgrade** —
14.2.35 is the last 14.x. **TEC-7 is decided: a Vercel firewall rate limit** on `POST /api/login`,
added by Joel and verified by you, read-only. The parking lot is the `Parked` label: the tracker
(TEC-36), the editor (TEC-37), TEC-14 and TEC-20.

**Joel's calls on 2026-09-24**, all in `DECISIONS.md`: the tracker is parked; the editor was resumed
only to take the login fix; TEC-21 is go; Coffee's "Search again" keeps only the freshest result;
the charter cap is 350; TEC-7 is option A; the hooks were rebuilt on Joel's authorisation; open work,
the parking lot and design reasoning live in Linear.

## What the review branches left behind

- **Login.** `from` is followed only when it is a path on the same origin (`lib/safe-redirect.ts`);
  the login handler is one stamped file (`lib/login.ts`); middleware exceptions are exact paths; the
  tracker's `/api/cron/*` needs the `CRON_SECRET` bearer at the gate as well as in the route; the
  attempts cookie is unsigned (it was a free signed sample of `SESSION_SECRET`).
- **Enforcement.** `drift` and CI are as `CLAUDE.md`'s *What is actually enforced* says. **The hooks
  are one guard**: `.claude/hooks/guard.mjs` runs `decide.mjs`, and `guard.test.mjs` holds its cases,
  which CI's drift job runs. It fails closed. Change what it refuses only with the case that proves it.
- **Database.** A rebuild from `supabase/` now gets the original four tables' grants
  (`record_original_table_grants`). The recorded version is whatever the hosted API stamped when it
  was applied at the gate — rename the file to match before merging, as `supabase/README.md` says.
- **The Health plan is the Linear document "Health — plan"**, not a repo file. Two applied migrations
  still name `.claude/HEALTH-PLAN.md` in their comments; migrations are history and stay as written.
- **The weekly Routine** "Weekly rules-drift audit" (Mondays 08:00 UTC) reads Linear, runs `drift`.

## Traps only here

- **`INTERNAL_API_SECRET` is one secret for two callers** (hub → tracker, tracker → editor). Joel had
  no copy and Vercel never shows a sensitive value again, so it was rotated to one new value on
  `tp-home`, `tp-tracker` and `tp-message-editor` (TEC-33 step 1). A 401 from the glance or the
  draft button means the three disagree.
- **A project env read cannot see team-shared variables.** `tp-home` showed only `GITHUB_TOKEN` and
  `VERCEL_TOKEN` at project scope; `SESSION_SECRET` and `APP_PASSWORD_HASH` must be shared ones.
- **The hub holds `GITHUB_TOKEN` and `VERCEL_TOKEN`** for the Pit Wall's reads — the most powerful
  credentials in the estate, on the app that holds no database key. TEC-32 item 4 and TEC-33 step 5
  are how that shrinks.
- **The Vercel connector lists write tools. Do not use them** — Joel, 2026-09-23: "follow charter".
  The guard asks Joel on each; that click is a backstop, so hand Joel the step instead.
- **A Linear patch matches the stored text**, where a `TEC-n` you wrote is stored as an issue-mention
  tag. Anchor a patch on the plain words around a mention, never on the mention itself.
- **Spawning an agent's session from here works** (`create_session`, with `outcome_branch`), but
  `CLAUDE.md` says agents never run at the same time and `KICKOFF.md` has them wait for Joel before
  branching. **Do not spawn one until Joel sanctions it.** Subagents inside this session, each in its
  own worktree, are fine and are how the review branches were built.
- **A helper session can be refused a `git commit` the parent is allowed** — the permission system
  decides per session. When that happens, take it to Joel; never re-run the refused action from here.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **A pull request body is a claim, not evidence** — read Vercel and Supabase live before repeating
  its deployment steps to Joel.
- **Build in a worktree, never the main checkout.** Building the hub rewrites three tracked
  `apps/home/lib/*.generated.ts` files; restore them before committing. TEC-32 item 6 ends it.
- **Cost is context × turns.** One session, one branch, end it — a review session that fans out to
  worktree subagents is the exception, and it should still end once the branches are pushed.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
