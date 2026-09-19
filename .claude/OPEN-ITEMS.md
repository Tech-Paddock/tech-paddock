# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-19.** · **Next number: 15.**

**Numbers are permanent.** A closed item's row is deleted and its number is never used again, so the
gaps below are correct rather than something to tidy. A new item takes `Next number` and increments
it. Numbering restarts at 15 because 1–14 were each reused during four renumbers on 2026-09-19 and
references to them are already ambiguous.

- Finished work is not here. Git log is the archive.
- Settled calls, mistakes and traps are in `.claude/DECISIONS.md`. Live facts are computed, at `/admin`.
- **An item whose owner is not Joel is a request to that agent**, picked up next session — a
  `SessionStart` hook prints this file into every one.
- **The Pit Wall renders `Waiting on Joel` and `Parked`** at build time, taking each entry's first
  bold run as its title — lead with a short bold phrase, reasoning underneath.

---

## Blocking everything else

Nothing.

## Waiting on Joel

1. **Pick how the login lockout gets fixed — the obvious fix is the wrong shape.** The counter is a
   signed cookie the client can drop, so nothing but a browser is limited; and **a per-app fix is
   worth nothing**, since one password opens all six. A firewall rate limit on `/api/login` needs no
   code; a shared table **gives the hub database credentials**. *LoE: minutes.*

## Waiting on an agent

2. **The hub's glance has lost its only source — live now, not pending.** *Owner: TechPad Gen.*
   `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the paused tracker's `/api/summary`.
   `fetchSummary` swallows the failure, so the panel empties quietly rather than erroring. **The hub
   gains database credentials for the first time.** *LoE: multi-session.*
3. **Build the `On track` stage.** *Owner: TD.* Agreed 2026-09-17: a fourth phrase and a sixth
   DevOps colour for a branch deployed and waiting on Joel to drive it. **It needs a deliberate
   deploy trigger of its own** now that automatic previews are off — and not an empty commit, which
   the rules forbid. *LoE: a session.*
4. **Build `packages/shared`.** *Owner: TD.* One real copy of the five-way files, a stamping
   script, and `drift` failing a copy that disagrees. *LoE: a session.*
5. **`shared.contacts` needs its other owner named.** *Owner: Message Editor.* Deliberately shared
   between the editor and the tracker; one of the two is going away. *LoE: minutes.*
6. **Two corrections in charters I may not edit** — re-measured 2026-09-19, and it was three.
   *Owner: TD.* `platform/RULES.md` no longer says five apps. **`techpad-gen/RULES.md` still does**,
   at lines 96 and 98. **`resume/RULES.md:87` names migration `20260918014500`, which no file
   matches** — that is the one `drift` warns on every run. Each goes to its agent. *LoE: minutes.*
7. **Write the surface guide — site and app.** *Owner: TD.* Joel, 2026-09-18: most tools are
   websites; **Coffee is the only real app**, and Health will be. Site is a thin index grouped by
   verb around a long page; app is one screen, thumb-first, no index. Mockups exist. **It is settled
   at standup**, so `STANDUP.md` gains surface beside the name and the schema. *LoE: a session.*

9. **Every merge rebuilds every app, and the last build to finish wins the domain.**
   *Owner: TD.* `ignoreCommand` in each `vercel.json` reads *skip previews, build everything else* —
   it cannot see which folder changed. On 2026-09-18 three merges four minutes apart left
   `techpaddock.io` aliased to the Coffee-icon build rather than the hub change. **Two merges close
   together can leave an app serving the older one.** *LoE: a session.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

10. **`tp-tracker` stays paused.** Tabled 2026-09-18, paused the same day — verified, `live: false`.
   **Paused is reversible and deleted is not**, so this is a safe place to leave it indefinitely.
   Un-parking means deleting it and its DNS record — no undo, and needs item 2 first. *LoE: minutes.*
11. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
   **Why parking is safe:** `tracker`'s `middleware.ts` waves `/api/cron/*` past the password gate
   and the route's guard reads `if (secret && …)`, so an unset `CRON_SECRET` skips the check and the
   endpoint is public — harmless *only* while Graph is unconfigured, and unreachable while paused.
   **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy,
   then `MS_GRAPH_*`. Graph first publishes an unauthenticated endpoint writing to Outlook.
   **Fail the guard closed and the ordering stops mattering** — one line, Pipeline Tracker's. *LoE: minutes.*
