# Technical Director — notes

State as of 2026-10-19. `RULES.md` has the role, `DECISIONS.md` the archive of reasoning; this is
only what is true and the traps. Open work is in Linear, team TEC. **Branch and pull request state
is never written here** — read it live.

---

## Where the work is

**TD + one builder + CI** since TEC-115 (2026-10-19). You start the builder per task after Joel's
go, it pushes and stops, and you merge through the `merge` skill. Deployment, the per-app agents,
their presets and handoffs are retired; each app's `RULES.md` and `NOTES.md` sit in its folder.
Linear labels are `owner:` (Joel, TD) and `app:<folder>`. **"Backlog" means a Linear issue in
Backlog, not built.** The parking lot is the `Parked` label.

## What is true now

- **Every live app is on Next 16 with `proxy.ts`** (TEC-34, closed 2026-10-19); the parked editor
  and tracker stay on 14 with `middleware.ts` until Joel unparks or retires them.
- **Home no longer reads `INTERNAL_API_SECRET`** (TEC-83): it stays linked to the paused tracker and
  editor, on builds from before it.
- **Every `ANTHROPIC_API_KEY` is proven in production** (TEC-75). Resume and the editor have none.
- **`apps/showcase` is yours to build, and public** (TEC-99): the scaffold waits on Joel showing
  you the uploader.
- **Linear writes don't prompt Joel** (TEC-59). Deletes, label retirement and diff tools still ask.
- **Health prices a recipe line from Cookbook's `GET /api/servings`** (TEC-25), forwarding only
  `paddock_session`. `SESSION_SECRET` parity between `tp-health` and `tp-cookbook` gates logging
  too: a mismatch reads as "Couldn't reach the Cookbook", not as a login bug.
- **This container cannot reach `*.techpaddock.io`** — nothing served there can be checked from
  here. Vercel's runtime logs and Joel are the substitute.
- **The guard tells the main session from a helper by `agent_id` on the hook input**; only the main
  session may write to a pull request.
- **The migration history is clean**: repo and `list_migrations` differ by exactly
  `20260908235234`, withheld because it seeds personal data.
- **`INTERNAL_API_SECRET` is one team-shared variable** for hub → tracker and tracker → editor.
  The paused tracker and editor are on builds from before it: a 401 there means an old build.

## Traps only here

- **Two TD sessions cannot see each other.** A second TD starts from `/kickoff second-opinion` and
  writes nothing. Before calling a pushed branch abandoned, check its commit's `Claude-Session`
  with `get_session`: a live session still owns it.
- **The guard runs from this session's checkout.** Editing `.claude/hooks/` there changes your own
  rules before merge; do that work in a separate worktree (TEC-115).
- **A project env read cannot see team-shared variables.** `list_user_events`, Vercel's audit log,
  records every change with its time, shared variables included.
- **The firewall can't be read or written through the API here** (`Seawall Config not found`).
- **Runtime logs hold no request lines for these apps.** To see whether a feature ran, count rows
  with `execute_sql` — counts and sources only, never content (TEC-113).
- **The GitHub integration moves Linear issues on its own**: In Progress when a linked pull request
  opens, Done when one naming it merges. After a merge, reopen any issue with Next steps left.
- **The auto-mode classifier can refuse work under `.claude/`** as self-modification. It clears once
  Joel's own words name the change. Never route round it; never probe the guard by editing it live.
- **A Linear patch matches the stored text.** Copy an anchor from `get_issue`, tags and all.
- **You cannot delete or rename a remote branch.** The proxy refuses it, disguised as a network
  blip: stop after one try. Merged branches auto-delete; Joel deletes stale ones.
- **A container restart kills the builder.** Unpushed work survives in `.claude/worktrees/agent-*`
  until the container goes; brief a fresh builder to carry it over.
- **Parallel builders can pick the same migration timestamp.** Check before merging.
- **With a pull request open, one push runs `gate` twice**, and a merge is refused while the second
  is queued. Read checks with `pull_request_read` → `get_check_runs`, never a curl loop (TEC-112).
- **A stacked branch conflicts once its base squash-merges.** Test first (`DECISIONS.md`): `main`'s
  copy against the base tip it stacked on; identical means take the branch side.
- **The hosted API renames migrations.** Read `list_migrations` back before merging and rename the
  file on the branch; a stacked branch carrying the old name brings it back.
- **A helper worktree refuses git inside a loop, a variable or `git -C`.** Run each git plainly.
- **Finished work hides in other sessions.** At kickoff, `list_sessions` and `git branch -r` show
  branches with no pull request and questions Joel never answered.
- **Cost is context × turns.** Brief tightly; end the session once the branches are merged.
