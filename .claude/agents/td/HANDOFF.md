# Technical Director — handoff

State as of 2026-10-18. `RULES.md` has the role, `DECISIONS.md` the reasoning; this is only what is
true and the traps. Open work is in Linear, team TEC. **Branch and pull request state is never
written here** — read it live.

---

## Where the work is

**The deployment layer is not yours.** The Deployment agent opens, gates, orders and merges every
pull request, applies migrations at the gate and owns Vercel, DNS and CI. **You start every agent as
your helper, from its preset, after Joel says go** — Opus 5.5 at medium for all of them.

**Joel's working model: one gate, now mechanical** (2026-09-26). Agents branch only when told,
commit, push and stop. **Only Deployment writes to a pull request**; the guard refuses anyone else,
you included. You start Deployment, and the guard holds that start for Joel's click: bring him the
list with it (branches, order, blast radius, migrations, questions). **Nothing but your brief bounds
the list's scope.** The three phrases are retired; **"Backlog" means a Linear issue in Backlog, not
built.** Linear writes go in whatever order makes sense. **Roll up only serious questions**; small
calls in an app are yours, logged on the issue. **TEC-34 (Next.js 14 → 16) is running**: the spike
proved Resume green on 16, and drift now ties each app's gate file to its Next major (step 2); the
per-app upgrades come next, one branch each. The parking lot is the `Parked` label. **TEC-86 waits
for Joel's go; TEC-108** (Backlog) is the skills plan that would retire `KICKOFF.md`.

## What is true now

- **Home no longer reads `INTERNAL_API_SECRET`** (TEC-83): it stays linked to the paused tracker and
  editor, on builds from before it. TechPad Gen's charter has home's keys now.
- **Every `ANTHROPIC_API_KEY` is proven in production** (TEC-75, closed 2026-10-18). Resume and the
  editor have none: Resume makes no model calls, and the editor is parked.
- **`apps/showcase` is yours to build, and public** (TEC-99): rules in your charter, enforced by
  drift's `public app holds nothing`. The scaffold waits on Joel showing you the uploader.
- **Linear writes don't prompt Joel, from this session or a helper** (TEC-59, since 2026-09-26).
  Deletes, label retirement and diff tools still ask, by design.
- **Health prices a recipe line from Cookbook's `GET /api/servings`** (TEC-25, live 2026-09-26),
  forwarding only `paddock_session`. So `SESSION_SECRET` parity between `tp-health` and `tp-cookbook`
  now gates logging too: a mismatch reads as "Couldn't reach the Cookbook", not as a login bug.
- **`lib/logout.ts` is stamped into every app beside the login handler** (TEC-73): shared auth
  plumbing, yours to review, and named in `CLAUDE.md`'s list of gated auth files (TEC-92).
- **This container cannot reach `*.techpaddock.io`** — the network policy refuses it — so nothing
  served there can be checked from here. Vercel's runtime logs are the substitute.
- **The guard knows Deployment by the `agent_type` on a helper's hook input.** Pull request writes
  have gone through since it landed (#253–#256), so it holds in practice; nobody has logged the field.
- **The Cookbook is an installable site** (TEC-102): three tabs, a home-screen icon, still a site.

## Traps only here

- **Two TD sessions cannot see each other.** On 2026-09-25 a second TD, started for a question, got
  a prompt meant for the first. It took the first's live branch for abandoned, merged `main` into it,
  had Deployment merge it, and replaced this handoff with one built on a stale read. **A second TD
  gets KICKOFF.md's second-opinion block and writes nothing.** Before calling a pushed branch
  abandoned, check its commit's `Claude-Session` with `get_session`: a live session still owns it.
- **A project env read cannot see team-shared variables.** That read reported `INTERNAL_API_SECRET`
  missing an hour after Joel linked it. Vercel's audit log, `list_user_events`, records every change
  with its time, shared variables included. Deployment's handoff has the other Vercel reading traps.
- **To pick up a changed variable, redeploy the app's live build** (`DECISIONS.md`, 2026-09-20).
- **The firewall can't be read or written through the API here:** every project answers `Seawall
  Config not found`, even after Joel published its rule (TEC-7). The audit log is the only evidence.
- **Runtime logs hold no request lines for these apps**, used or not. To see whether a feature ran,
  count rows in its tables with `execute_sql` — counts and sources only, never content (TEC-113).
- **The GitHub integration closes a Linear issue when a pull request naming it merges**, in its title
  or its body. After a merge, reopen any issue whose Next steps are not all done.
- **The auto-mode classifier can refuse work under `.claude/` or another agent's charter** as
  self-modification, even with an approved issue behind it. It clears once Joel's own words name the
  change. Ask him for them; never route round it. Probing what a hook receives, by editing the live
  guard or reading the Claude Code binary, is refused outright (2026-09-29): rely on the docs.
- **A Linear patch matches the stored text.** Copy an anchor from `get_issue`'s output, tags and
  all; a retyped `TEC-n` never matches.
- **A helper can be refused an action this session is allowed** — on 2026-09-29, Deployment's push
  to another agent's branch. Take it to Joel; never re-run the refused action yourself.
- **You cannot delete a remote branch.** The proxy refuses it, disguised as a network blip
  (`DECISIONS.md`, traps): stop after one try. Merged branches auto-delete; Joel deletes stale ones.
- **A container restart kills every helper.** Pushed branches survive; unpushed work survives in
  `.claude/worktrees/agent-*` until the container goes. Brief a fresh helper to carry it over.
- **Parallel helpers can pick the same migration timestamp.** Check before the list goes to Joel.
- **Finished work hides in other sessions.** At kickoff, `list_sessions` and `git branch -r` show
  branches with no pull request and questions Joel never answered; on 10/18 three sat for 3–13 days.
- **No agent can rename a branch `stale_`**: it means deleting the old name. Name it; Joel deletes it.
- **Cost is context × turns.** Brief tightly; end the session once the branches are pushed.
