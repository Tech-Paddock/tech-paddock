# Technical Director — handoff

State as of 2026-09-25. `RULES.md` has the role, `DECISIONS.md` the reasoning; this is only what is
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
migrations, questions. His go starts Deployment on exactly that list. **Write your Linear updates
last**, once every other change in the session's queue is pushed, not as you go (Joel, 2026-09-25 —
now in your charter).

**The 2026-09-25 train is merged**, TEC-27's sub-issues, TEC-71 and TEC-72 included. **Still Joel's:**
TEC-33 steps 1 and 6, TEC-7. The parking lot is the `Parked` label.

## What is true now

- **`tp-tracker` and `tp-message-editor` are paused** — confirmed live: production deployments on
  both read `BLOCKED`, which is what a paused project serves. They were paused **before** TEC-33
  step 1 landed, out of the order the issue describes.
- **TEC-33 step 1 (`INTERNAL_API_SECRET`) is not done, and worse than the issue text says:**
  `tp-home` and `tp-message-editor` have no `INTERNAL_API_SECRET` at all; `tp-tracker` still holds
  the original, never-edited value. Because the other two are now paused, step 1 needs them
  **resumed first** — a paused project can't redeploy to pick up a new value.
- **`VERCEL_TOKEN` is off `tp-home`** — confirmed live; only `GITHUB_TOKEN` remains there now.
- **TEC-7: Joel chose option A** ("Go with option A, add the rules"). The firewall rate limit is
  still not published on any project — confirmed by reading each one's firewall config, parked ones
  included.
- **A stale branch or pull request is renamed `stale_<name>`, never deleted** (CLAUDE.md, *Always*).
  No agent's toolset exposes a branch rename or delete call, TD included, and the guard's `git push`
  reader only refuses a push that lands on `main` — deleting elsewhere isn't hook-refused, just not
  yet tooled. The three known-stale Cookbook branches still need Joel's dashboard until a tool exists.
- **Helper Linear writes still prompt Joel; the main session's don't** (TEC-59, open). Helpers make
  no Linear writes until it's fixed: they list changes in their report and you apply them.

## Traps only here

- **The GitHub integration closes a Linear issue when a pull request naming it merges.** After a
  merge, reopen any issue whose Next steps are not all done.
- **The auto-mode classifier can refuse work under `.claude/hooks/` or another agent's charter** as
  self-modification, even with an approved issue behind it. Ask Joel for the words that clear it;
  never route round it.
- **A Linear patch matches the stored text.** Copy an anchor from `get_issue`'s output, tags and
  all; a retyped `TEC-n` never matches.
- **A helper can be refused an action this session is allowed.** Take it to Joel; never re-run the
  refused action yourself.
- **A migration is recorded under a new version at the gate** and the file renamed to match — cite
  it by name, never its number (TEC-72).
- **Cost is context × turns.** A helper's report lands in your context: brief tightly, end the
  session once the branches are pushed.
- **You are a session, not a service.** Nothing is watching once the window closes.
