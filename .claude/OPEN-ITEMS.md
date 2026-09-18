# Open items

**What is open, and who owns the next action.** Nothing else. This file is state: it is
**overwritten**, never appended to, and it has a ceiling of **80 lines**. It grew to 588 once, of
which 401 were an archive of finished work that every agent read at the start of every session.

- Finished work is not here. Git log is the archive.
- Settled decisions, mistakes and traps are not here. They are in `.claude/DECISIONS.md`.
- Facts about the running system are not here. They are computed, at `/admin`.

A `SessionStart` hook prints this into every session, so it is already in your context.

**Agents: read this, and say so in your own handoff if you need something on it.** The technical
director writes it. An item with an owner who is not Joel is a request to that agent.

**The Pit Wall renders `Waiting on Joel` and `Parked`** at build time, taking the first bold run of
each entry as its title — so lead with a short bold phrase and put the reasoning underneath.

**Last reviewed: 2026-09-18.**

---

## Blocking everything else

Nothing.

## Waiting on Joel

1. **`tp-tracker` is paused, not deleted.** Paused 2026-09-18; verified, the project reads
   `live: false`. **Pausing is reversible and deleting is not, so there is no hurry to leave it.**
   The subdomain still points at it and serves nothing, the daily cron no longer fires, and its
   builds have stopped. Deleting is still the end state and still needs the glance first. *LoE: minutes.*
2. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, read-only Contents +
   Metadata + Pull requests — not Actions. `VERCEL_TOKEN` team-scoped, with an expiry.
   **The redeploy is not optional** — Vercel bakes the environment in at build time. *LoE: minutes.*
3. **What is the Feed?** In the settled tab order and nowhere else, so it ships as a labelled empty
   slot. **A feed is rows** — the same hub rule the tracker's move already bends. Deciding is
   minutes; building it is not. *LoE: minutes.*
4. **Raise the hairline contrast bar?** `--line` on `--surface` is 1.82:1 in production, short of
   the 3:1 bar for a non-text component. Raising it **changes the look of every app**, so the answer
   is minutes and the consequence is not. *LoE: minutes.*

## Waiting on an agent

Requests with an owner who is not Joel — how one agent asks another for something, since they never
run at once. The owning agent picks it up next session, because the hook prints this file into one.

5. **Stand up the health tracker.** *Owner: TD.* Name settled 2026-09-17, guardrails approved, plan
   at `.claude/HEALTH-PLAN.md`, the gate's reading in issue #98. **Nothing is blocked on Joel** —
   execute `.claude/agents/STANDUP.md` from step 3. What still needs him is inside that protocol:
   the Vercel project and the DNS record have no undo and no agent may create them. *LoE: a session.*
6. **Build `packages/shared`.** *Owner: TD.* One real copy of the five five-way files, a script that
   stamps each app's copy from it, and `drift` failing a copy that disagrees. **This was on Joel's
   list and should not have been** — it changes no Vercel setting and no deploy. *LoE: a session.*
7. **The hub's glance has lost its only source — live now, not pending.** *Owner: TechPad Gen.*
   `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the tracker's `/api/summary`, and the
   tracker is paused. `fetchSummary` swallows the failure, so the panel empties quietly rather than
   erroring. **The hub gains database credentials for the first time.** *LoE: multi-session.*
8. **`shared.contacts` needs its other owner named.** *Owner: Message Editor.* It is deliberately
   shared between the editor and the tracker; one of the two is going away. *LoE: minutes.*
9. **`Paper.tsx` throws a hydration error on every load.** *Owner: TechPad Gen.* Raised in #103,
   predating it: `today()` renders the date with a comma on the server and without it in the
   browser, dropping that Suspense boundary to client rendering. *LoE: minutes.*
10. **A bcrypt hash in `.env.local` needs every `$` escaped as `\$`.** *Owner: Joel.* `@next/env`
   strips quotes and expands anyway, cutting a 60-character hash to 44 and failing every login
   silently. Raised in #103 against `CLAUDE.md`, which carries **no `.env.local` guidance at all** —
   so the advice is sound, its target is wrong, and it needs a home you approve. *LoE: minutes.*

## Parked

Deliberately deferred. Not waiting on anyone, not forgotten, **not to be picked up as background
work.** Something here moves only when Joel says so.

11. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
   **Why parking is the safe state:** `tracker`'s `middleware.ts` waves `/api/cron/*` past the
   password gate, and the route's guard reads `if (secret && …)` — an unset `CRON_SECRET` skips the
   check and the endpoint is public, harmless *only* while Graph is unconfigured.
   **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy,
   and only then set `MS_GRAPH_*`. Graph first publishes an unauthenticated endpoint that writes
   into Joel's Outlook.
