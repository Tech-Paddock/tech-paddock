# Open items

**What is open, and who owns the next action. Nothing else.** The shape of this file — overwritten,
never appended, ≤80 lines — is in `CLAUDE.md`'s channel table and is not restated here. It grew to
588 lines once, of which 401 were finished work every agent then read at the start of every session.

- Finished work is not here. Git log is the archive.
- Settled calls, mistakes and traps are in `.claude/DECISIONS.md`. Live facts are computed, at `/admin`.
- **An item whose owner is not Joel is a request to that agent**, picked up at the start of its next
  session, because a `SessionStart` hook prints this file into every one.

**The Pit Wall renders `Waiting on Joel` and `Parked`** at build time, taking the first bold run of
each entry as its title — so lead with a short bold phrase and put the reasoning underneath.

**Last reviewed: 2026-09-18.**

---

## Blocking everything else

Nothing.

## Waiting on Joel

1. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, read-only Contents +
   Metadata + Pull requests — not Actions. `VERCEL_TOKEN` team-scoped, with an expiry. **The redeploy
   is not optional** — Vercel bakes the environment in at build time. *LoE: minutes.*
2. **`tp-health` exists but is not wired up.** The project is named right; nothing else is. Two
   settings, both yours because no agent may touch domains: **attach `health.techpaddock.io`**, which
   has a Cloudflare record pointing at a host Vercel does not claim, and **set the Root Directory**,
   which is unset — so it builds the repo root on every merge, outside the previews guard, for an app
   that does not exist yet. *LoE: minutes.*
3. **`DECISIONS.md` is seven lines from its ceiling.** Append-only, 193 of 200, and **no trimming
   rule exists** — so the wall arrives with nothing behind it. The migration-version finding below
   fits once; the one after it will not. Raise the ceiling or agree what may be cut. *LoE: minutes.*
4. **What is the Feed?** In the settled tab order and nowhere else, so it ships as a labelled empty
   slot. **A feed is rows** — the same hub rule the tracker's move already bends. *LoE: minutes.*
5. **Raise the hairline contrast bar?** `--line` on `--surface` is 1.82:1, short of the 3:1 bar for a
   non-text component. Raising it **changes the look of every app**. *LoE: minutes.*

## Waiting on an agent

6. **The hub's glance has lost its only source — live now, not pending.** *Owner: TechPad Gen.*
   `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the paused tracker's `/api/summary`.
   `fetchSummary` swallows the failure, so the panel empties quietly rather than erroring. **The hub
   gains database credentials for the first time.** *LoE: multi-session.*
7. **Stand up the health tracker.** *Owner: TD.* Name and guardrails settled, plan at
   `.claude/HEALTH-PLAN.md`, the gate's reading in issue #98. Execute `.claude/agents/STANDUP.md`
   from step 3. **Blocked on item 2, not on Joel's word.** *LoE: a session.*
8. **Build the `On track` stage.** *Owner: TD.* Agreed 2026-09-17: a fourth phrase and a sixth
   DevOps colour for a branch deployed and waiting on Joel to drive it. **It needs a deliberate
   deploy trigger of its own** now that automatic previews are off — and not an empty commit, which
   the rules forbid. *LoE: a session.*
9. **`drift` ages every agent on a cross-cutting change.** *Owner: TD.* Freshness is dated from
   `git log -- apps/<app>`, so #108 touching every `vercel.json` flagged three agents stale for a
   file they did not write. **The handoffs are not the problem; the check is.** *LoE: minutes.*
10. **Build `packages/shared`.** *Owner: TD.* One real copy of the five five-way files, a stamping
   script, and `drift` failing a copy that disagrees. *LoE: a session.*
11. **The `\$` escaping warning needs a home.** *Owner: TD.* `@next/env` strips quotes and expands
   anyway, cutting a 60-character bcrypt hash to 44 and failing every login silently. Its home is the
   five `.env.example` files, one line under the command that generates the hash. *LoE: minutes.*
12. **`shared.contacts` needs its other owner named.** *Owner: Message Editor.* Deliberately shared
   between the editor and the tracker; one of the two is going away. *LoE: minutes.*
13. **`Paper.tsx` throws a hydration error on every load.** *Owner: TechPad Gen.* `today()` renders
   the date with a comma on the server and without it in the browser. *LoE: minutes.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

14. **`tp-tracker` stays paused.** Tabled 2026-09-18, paused the same day — verified, `live: false`.
   **Paused is reversible and deleted is not**, so this is a safe place to leave it indefinitely.
   Un-parking means deleting it and its DNS record — no undo, and it needs item 6 first.
15. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
   **Why parking is safe:** `tracker`'s `middleware.ts` waves `/api/cron/*` past the password gate
   and the route's guard reads `if (secret && …)`, so an unset `CRON_SECRET` skips the check and the
   endpoint is public — harmless *only* while Graph is unconfigured, and unreachable while paused.
   **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy,
   and only then set `MS_GRAPH_*`. Graph first publishes an unauthenticated endpoint that writes
   into Joel's Outlook.
