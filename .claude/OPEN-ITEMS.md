# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-18.**

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

1. **Raise the hairline contrast bar?** `--line` on `--surface` is 1.82:1, short of the 3:1 bar for a
   non-text component. Raising it **changes the look of every app**. *LoE: minutes.*

## Waiting on an agent

2. **The hub's glance has lost its only source — live now, not pending.** *Owner: TechPad Gen.*
   `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the paused tracker's `/api/summary`.
   `fetchSummary` swallows the failure, so the panel empties quietly rather than erroring. **The hub
   gains database credentials for the first time.** *LoE: multi-session.*
3. **Delete the Feed tab and rename Board to Pit Wall.** *Owner: TechPad Gen.* Settled 2026-09-18 and
   recorded in `DECISIONS.md`; the code is `apps/home/app/Landing.tsx`, which is yours, not mine.
   `TABS` loses `feed` and its empty slot; `board` keeps its id and reads **Pit Wall**. *LoE: minutes.*
4. **Build the `On track` stage.** *Owner: TD.* Agreed 2026-09-17: a fourth phrase and a sixth
   DevOps colour for a branch deployed and waiting on Joel to drive it. **It needs a deliberate
   deploy trigger of its own** now that automatic previews are off — and not an empty commit, which
   the rules forbid. *LoE: a session.*
5. **`drift` ages every agent on a cross-cutting change.** *Owner: TD.* Freshness is dated from
   `git log -- apps/<app>`, so #108 touching every `vercel.json` flagged three agents stale for a
   file they did not write. **The handoffs are not the problem; the check is.** *LoE: minutes.*
6. **Build `packages/shared`.** *Owner: TD.* One real copy of the five-way files, a stamping
   script, and `drift` failing a copy that disagrees. *LoE: a session.*
7. **The `\$` escaping warning needs a home.** *Owner: TD.* `@next/env` strips quotes and expands
   anyway, cutting a 60-character bcrypt hash to 44 and failing every login silently. Its home is
   every `.env.example`, one line under the command that generates the hash. *LoE: minutes.*
8. **`shared.contacts` needs its other owner named.** *Owner: Message Editor.* Deliberately shared
   between the editor and the tracker; one of the two is going away. *LoE: minutes.*
9. **Three corrections in charters I may not edit.** *Owner: TD.* Carry each to its agent next
   session. `platform/RULES.md` and `techpad-gen/RULES.md` still say five apps; `resume/RULES.md`
   names the migration version I renamed at #107's gate, which `drift` warns on. *LoE: minutes.*
10. **`Paper.tsx` throws a hydration error on every load.** *Owner: TechPad Gen.* `today()` renders
   the date with a comma on the server and without it in the browser. *LoE: minutes.*
11. **Write the surface guide — site and app.** *Owner: TD.* Joel, 2026-09-18: most tools are
   websites; **Coffee is the only real app**, and Health will be. Site is a thin index grouped by
   verb around a long page; app is one screen, thumb-first, no index. Mockups exist. **It is settled
   at standup**, so `STANDUP.md` gains surface beside the name and the schema. *LoE: a session.*

12. **Every merge rebuilds every app, and the last build to finish wins the domain.**
   *Owner: TD.* `ignoreCommand` in each `vercel.json` reads *skip previews, build everything else* —
   it cannot see which folder changed. On 2026-09-18 three merges four minutes apart left
   `techpaddock.io` aliased to the Coffee-icon build rather than the hub change. **Two merges close
   together can leave an app serving the older one.** *LoE: a session.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

13. **`tp-tracker` stays paused.** Tabled 2026-09-18, paused the same day — verified, `live: false`.
   **Paused is reversible and deleted is not**, so this is a safe place to leave it indefinitely.
   Un-parking means deleting it and its DNS record — no undo, and needs item 2 first. *LoE: minutes.*
14. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
   **Why parking is safe:** `tracker`'s `middleware.ts` waves `/api/cron/*` past the password gate
   and the route's guard reads `if (secret && …)`, so an unset `CRON_SECRET` skips the check and the
   endpoint is public — harmless *only* while Graph is unconfigured, and unreachable while paused.
   **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy,
   then `MS_GRAPH_*`. Graph first publishes an unauthenticated endpoint writing to Outlook. *LoE: minutes.*
