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

**Last reviewed: 2026-09-17.**

---

## Blocking everything else

Nothing.

## Waiting on Joel

1. **Settle the macro tracker's name.** The plan is in `.claude/MACRO-TRACKER-PLAN.md`, and the
   six guardrails are approved and recorded there. **The name is the last thing blocking the
   scaffold** — it fixes the folder, subdomain, Vercel project and schema at once, and every one of
   those is expensive to change afterwards. Candidates: `fuel`, `macros`, `intake`. The gate's own
   reading is issue #98. *LoE: minutes.*
2. **Delete the `tp-tracker` Vercel project and its DNS record** — last step of the deprecation, not
   the first, and there is no undo. Only after the Pit Wall serves what the tool served. Safe to do
   at all now that the required checks no longer name a per-app job. *LoE: minutes.*
3. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, this repo, read-only:
   Contents, Metadata, Pull requests, Actions. `VERCEL_TOKEN` read-only, `tech-paddock` team.
   **The redeploy is not optional** — Vercel bakes the environment in at build time. *LoE: minutes.*
4. **Re-upload the active resume template.** #96 made it **the substrate every render is built on** —
   the renderer edits the template's own bytes rather than working from a description of it — so an
   out-of-date one renders an out-of-date design on every job. *LoE: minutes.*
5. **What is the Feed?** In the settled tab order and nowhere else, so it ships as a labelled empty
   slot. **A feed is rows** — the same hub rule the tracker's move already bends. Deciding is
   minutes; building it is not. *LoE: minutes.*
6. **Raise the hairline contrast bar?** `--line` on `--surface` is 1.82:1 in production, short of
   the 3:1 bar for a non-text component. Raising it **changes the look of every app**, so the answer
   is minutes and the consequence is not. *LoE: minutes.*

## Waiting on an agent

Requests with an owner who is not Joel. This is how one agent asks another for something — they
never run at the same time, so it lands here or it does not happen. The owning agent picks it up at
the start of its next session, because the hook prints this file into every one.

7. **Build `packages/shared`.** *Owner: TD.* One real copy of the five five-way files, a script that
   stamps each app's copy from it, and `drift` failing a copy that disagrees. **This was on Joel's
   list and should not have been** — it changes no Vercel setting and no deploy. *LoE: a session.*
8. **The Pit Wall must serve what the tracker served before `apps/tracker` goes.** *Owner: TechPad
   Gen.* `SOURCES` in `apps/home/lib/glance.ts` holds exactly one entry — the tracker's
   `/api/summary` — so deleting the tool empties the hub's glance. **The hub gains database
   credentials for the first time**, which its own file says it does not have. *LoE: multi-session.*
9. **`shared.contacts` needs its other owner named.** *Owner: Message Editor.* It is deliberately
   shared between the editor and the tracker; one of the two is going away. *LoE: minutes.*

## Parked

Deliberately deferred. Not waiting on anyone, not forgotten, **not to be picked up as background
work.** Something here moves only when Joel says so.

10. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
   **Why parking is the safe state:** a scheduled job cannot log in, so `tracker`'s `middleware.ts`
   waves `/api/cron/*` past the password gate, and the route's own guard reads `if (secret && …)` —
   an unset `CRON_SECRET` skips the check entirely and the endpoint is public. It is harmless *only*
   because the next line returns early while Graph is unconfigured.
   **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy
   so it is live, and only then set `MS_GRAPH_*`. Setting the Graph credentials first publishes an
   unauthenticated endpoint that writes into Joel's Outlook on demand.
