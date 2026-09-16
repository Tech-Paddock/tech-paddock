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

**Last reviewed: 2026-09-16.**

---

## Blocking everything else

Nothing.

## Waiting on Joel

1. **Solution Macro Tracker into a draft charter.** The standup cannot start without one — it is the
   protocol's step 2. `.claude/agents/macros/RULES.md`, worked out with the new agent, not with the
   TD. **Macro Tracker and Pipeline Tracker collide in speech**, and the folder is not what gets said.
2. **`packages/shared` — decide it before the next app folder exists.** Five files are byte-identical
   in every app; `drift` checksums three of them and the other two hold by convention alone. The
   cheapest moment is while the roster is shrinking rather than after it grows.
3. **Does `apps/tracker` deprecate into the Pit Wall?** It contradicts a settled rule either way: the
   hub holds no database credentials and shows counts and singles, never rows. Same collision as the
   Feed below. Deprecating also retires the parked `CRON_SECRET` hazard, which lives in its gate.
4. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, this repo, read-only:
   Contents, Metadata, Pull requests, Actions. `VERCEL_TOKEN` read-only, `tech-paddock` team.
   **The redeploy is not optional** — Vercel bakes the environment in at build time. Until both are
   set the Pit Wall runs on repo rows and names the missing sources under "not reported", which is
   the designed degraded state rather than a failure.
5. **Re-upload the active resume template.** #71 ended re-uploads for *code* changes — the renderer
   re-extracts from the stored `.docx`, never the template. It is also the starting document for the
   Word workflow, so an old one renders old and blocks that workflow's first step.
6. **What is the Feed?** In the settled tab order and nowhere else, so it ships as a labelled empty
   slot rather than an invented one. **A feed is rows, and the hub's rule is counts and singles,
   never rows** — so a Feed either bends that rule or is not what the word means. Nothing is blocked.
7. **Switch the required checks to `gate`, `drift` and `requested-by-joel`**, dropping every per-app
   entry. The matrix is derived now, so a per-app required check breaks on every roster change —
   deprecating an app leaves one that can never report. Repository settings, unverifiable from here.
8. **The pull-request watcher rule.** An agent may subscribe to its own PR, own app only. **Only one
   watcher gets the events** — a second subscriber silently receives nothing — and the subscription
   dies with that session, so the offer is only honest said out loud. Yes or no.
9. **Raise the hairline contrast bar?** `--line` on `--surface` is 1.82:1 in production, short of
   the 3:1 bar for a non-text component. Raising it **changes the look of every app**.

## Waiting on an agent

Requests with an owner who is not Joel. This is how one agent asks another for something — they
never run at the same time, so it lands here or it does not happen. The owning agent picks it up at
the start of its next session, because the hook prints this file into every one.

1. **Trim `techpad-gen/HANDOFF.md` off the ceiling.** *Owner: TechPad Gen — done, not yet landed.*
   It is 76 of 80 on #92, which is open and green. The row closes when that merges.

## Parked

Deliberately deferred. Not waiting on anyone, not forgotten, **not to be picked up as background
work.** Something here moves only when Joel says so.

- **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
  **Why parking is the safe state:** a scheduled job cannot log in, so `tracker`'s `middleware.ts`
  waves `/api/cron/*` past the password gate, and the route's own guard reads `if (secret && …)` —
  an unset `CRON_SECRET` skips the check entirely and the endpoint is public. It is harmless *only*
  because the next line returns early while Graph is unconfigured.
  **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy
  so it is live, and only then set `MS_GRAPH_*`. Setting the Graph credentials first publishes an
  unauthenticated endpoint that writes into Joel's Outlook on demand.
