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

1. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, read-only Contents +
   Metadata + Pull requests — not Actions. `VERCEL_TOKEN` team-scoped, with an expiry. **The redeploy
   is not optional** — Vercel bakes the environment in at build time. *LoE: minutes.*
2. **Wire up `tp-health` — four steps, in order, none with an undo.** Health is on `main`; none of it
   is reachable until these are done. **(a) Root Directory → `apps/health`** — Settings → Build &
   Deployment. It is also **the only project still building previews**, because Vercel cannot see
   `apps/health/vercel.json` from the repo root. **(b) Attach `health.techpaddock.io`.** **(c) Env
   vars, `SESSION_SECRET` byte-identical, then redeploy.** **(d) Add `health` to Supabase's
   exposed-schemas list**, or every query fails as a permissions error that reads like a bad key.
   *LoE: minutes.*
3. **Raise the hairline contrast bar?** `--line` on `--surface` is 1.82:1, short of the 3:1 bar for a
   non-text component. Raising it **changes the look of every app**. *LoE: minutes.*

## Waiting on an agent

4. **The hub's glance has lost its only source — live now, not pending.** *Owner: TechPad Gen.*
   `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the paused tracker's `/api/summary`.
   `fetchSummary` swallows the failure, so the panel empties quietly rather than erroring. **The hub
   gains database credentials for the first time.** *LoE: multi-session.*
5. **Delete the Feed tab and rename Board to Pit Wall.** *Owner: TechPad Gen.* Settled 2026-09-18 and
   recorded in `DECISIONS.md`; the code is `apps/home/app/Landing.tsx`, which is yours, not mine.
   `TABS` loses `feed` and its empty slot; `board` keeps its id and reads **Pit Wall**. *LoE: minutes.*
6. **Build the `On track` stage.** *Owner: TD.* Agreed 2026-09-17: a fourth phrase and a sixth
   DevOps colour for a branch deployed and waiting on Joel to drive it. **It needs a deliberate
   deploy trigger of its own** now that automatic previews are off — and not an empty commit, which
   the rules forbid. *LoE: a session.*
7. **`drift` ages every agent on a cross-cutting change.** *Owner: TD.* Freshness is dated from
   `git log -- apps/<app>`, so #108 touching every `vercel.json` flagged three agents stale for a
   file they did not write. **The handoffs are not the problem; the check is.** *LoE: minutes.*
8. **Build `packages/shared`.** *Owner: TD.* One real copy of the five-way files, a stamping
   script, and `drift` failing a copy that disagrees. *LoE: a session.*
9. **The `\$` escaping warning needs a home.** *Owner: TD.* `@next/env` strips quotes and expands
   anyway, cutting a 60-character bcrypt hash to 44 and failing every login silently. Its home is
   every `.env.example`, one line under the command that generates the hash. *LoE: minutes.*
10. **`shared.contacts` needs its other owner named.** *Owner: Message Editor.* Deliberately shared
   between the editor and the tracker; one of the two is going away. *LoE: minutes.*
11. **Three corrections in charters I may not edit.** *Owner: TD.* Carry each to its agent next
   session. `platform/RULES.md` and `techpad-gen/RULES.md` still say five apps; `resume/RULES.md`
   names the migration version I renamed at #107's gate, which `drift` warns on. *LoE: minutes.*
12. **`Paper.tsx` throws a hydration error on every load.** *Owner: TechPad Gen.* `today()` renders
   the date with a comma on the server and without it in the browser. *LoE: minutes.*
13. **Write the surface guide — site and app.** *Owner: TD.* Joel, 2026-09-18: most tools are
   websites; **Coffee is the only real app**, and Health will be. Site is a thin index grouped by
   verb around a long page; app is one screen, thumb-first, no index. Mockups exist. **It is settled
   at standup**, so `STANDUP.md` gains surface beside the name and the schema. *LoE: a session.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

14. **`tp-tracker` stays paused.** Tabled 2026-09-18, paused the same day — verified, `live: false`.
   **Paused is reversible and deleted is not**, so this is a safe place to leave it indefinitely.
   Un-parking means deleting it and its DNS record — no undo, and needs item 4 first. *LoE: minutes.*
15. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15.
   **Why parking is safe:** `tracker`'s `middleware.ts` waves `/api/cron/*` past the password gate
   and the route's guard reads `if (secret && …)`, so an unset `CRON_SECRET` skips the check and the
   endpoint is public — harmless *only* while Graph is unconfigured, and unreachable while paused.
   **Un-parking is the dangerous moment and the order is not optional.** Set `CRON_SECRET`, redeploy,
   then `MS_GRAPH_*`. Graph first publishes an unauthenticated endpoint writing to Outlook. *LoE: minutes.*
