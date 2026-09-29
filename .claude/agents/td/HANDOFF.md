# Technical Director — handoff

State as of 2026-09-26. `RULES.md` has the role, `DECISIONS.md` the reasoning; this is only what is
true and the traps. Open work is in Linear, team TEC. **Branch and pull request state is never
written here** — read it live.

---

## Where the work is

**The deployment layer is no longer yours.** Since 2026-09-24 the Deployment agent opens, gates,
orders and merges every pull request, applies migrations at the gate and owns Vercel, DNS and CI.
**You start every agent as your helper, from its preset, after Joel says go** — Opus 5.5 at medium
for all of them. TEC-40 is that change.

**Joel's working model (2026-09-25): one gate.** Agents cut branches and commit, never a pull
request. When branches are ready you bring Joel one list: branches, order, blast radius,
migrations, questions. His go starts Deployment on exactly that list, and he hears nothing more
about pull requests or merges unless a question comes up. **Nothing enforces the list's scope** now
that merging asks no click (TEC-43). **Roll up only serious questions**; small calls in an app are
yours, logged on the issue. Your Linear writes go last (your charter). **TEC-34 (Next.js 14 → 16)
is on hold** (Joel, 2026-09-25); the parking lot is the `Parked` label.

## What is true now

- **`INTERNAL_API_SECRET` is one team-shared variable**, linked to `tp-home`, `tp-tracker` and
  `tp-message-editor` since 2026-09-25; the tracker's old per-project copy is gone. The hub's live
  build carries it. **The paused tracker and editor still run 2026-09-24 builds from before it**,
  and stay that way (Joel, 2026-09-26: "I already added the linked var"). It reaches them on their
  next build; until then the hub's glance gets no answer from the tracker (TEC-8).
- **`ANTHROPIC_API_KEY` has new values on Coffee, Cookbook and Health** (Joel, 2026-09-25), and each
  app has run on its new value since the TD redeployed it on 2026-09-26, at Joel's request. Resume
  and the editor have none set: Resume makes no model calls, and the editor is parked.
- **`VERCEL_TOKEN` is gone from `tp-home`**, live build included; only `GITHUB_TOKEN` remains there.
- **`tp-tracker` and `tp-message-editor` are paused**: their production deployments read `BLOCKED`.
- **Linear writes no longer prompt Joel, from this session or a helper** (TEC-59, tested with him
  watching on 2026-09-26, after he set the connector's tools to allowed on claude.ai). Helpers make
  their own Linear writes again. Deletes, label retirement and diff tools still ask, by design.
- **The weekly Routine "Weekly rules-drift audit"** (Mondays 08:00 UTC) names Deployment as the gate
  since 2026-09-25 (TEC-42). It is report-only.
- **Health prices a recipe line from Cookbook's `GET /api/servings`** (TEC-25, live 2026-09-26),
  forwarding only `paddock_session`. So `SESSION_SECRET` parity between `tp-health` and `tp-cookbook`
  now gates logging too: a mismatch reads as "Couldn't reach the Cookbook", not as a login bug.
- **`lib/logout.ts` is stamped into every app beside the login handler** (TEC-73). It is shared auth
  plumbing and yours to review, though `CLAUDE.md`'s list of stamped auth files does not name it yet.
- **Joel runs TechPad Gen in his own session** (2026-09-26); its branches join a list only by him.
- **This container cannot reach `*.techpaddock.io`** — the network policy refuses it — so nothing
  served there can be checked from here. Vercel's runtime logs are the substitute.

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
- **A firewall can't be set up through the API on a project that never had one:** a PUT answers
  `Seawall Config not found`, even a bare `firewallEnabled`. Firewall rules go in from the dashboard.
- **The GitHub integration closes a Linear issue when a pull request naming it merges**, in its title
  or its body. After a merge, reopen any issue whose Next steps are not all done.
- **The auto-mode classifier can refuse work under `.claude/` or another agent's charter** as
  self-modification, even with an approved issue behind it. It clears once Joel's own words name the
  change. Ask him for them; never route round it.
- **A Linear patch matches the stored text.** Copy an anchor from `get_issue`'s output, tags and
  all; a retyped `TEC-n` never matches.
- **A helper can be refused an action this session is allowed.** Take it to Joel; never re-run the
  refused action yourself.
- **You cannot delete a remote branch.** The proxy refuses it, disguised as a network blip
  (`DECISIONS.md`, traps): stop after one try. Merged branches auto-delete; Joel deletes stale ones.
- **A container restart kills every helper.** Pushed branches survive; unpushed work survives in
  `.claude/worktrees/agent-*` until the container goes. Brief a fresh helper to carry it over.
- **Parallel helpers can pick the same migration timestamp.** Check before the list goes to Joel.
- **Cost is context × turns.** A helper's report lands in your context: brief tightly, end the
  session once the branches are pushed.
