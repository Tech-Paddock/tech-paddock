# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-19.** · **Next number: 20.**

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

10. **`tp-tracker` was never paused — the field that said so means something else.** *Owner: Joel.*
   Measured 2026-09-19: it built `4133904` to **production, `READY`**. `live: false` says nothing
   about pausing; `tp-home` reads it too and serves `techpaddock.io`. **The signal is deployment
   state** — a paused project returns `BLOCKED`, as `tp-message-editor` does. So the tracker is up
   and its daily cron runs. `apps/tracker` is TechPad Gen's as of 2026-09-19. **Pause it for real, or stop calling it paused.**
   *LoE: minutes.*
15. **The domain map is written down twice, and one copy went stale for a day.** *Owner: Joel.*
   `CLAUDE.md` and `platform/RULES.md` both carry a Vercel-project table; Health reached only the
   first, so the charter listed five projects against six on disk. Both corrected. **The fix is
   deleting the charter's copy and linking `CLAUDE.md`'s** — one fact, one home — but it is a
   charter, so it is your yes. *LoE: minutes.*
18. **`DECISIONS.md` is full — 260 of its 260 lines.** *Owner: Joel.* Append-only with no trimming
   rule, so the next settled call has nowhere to go. **Raise the ceiling, do not trim.** *LoE: minutes.*

## Waiting on an agent

2. **The hub's glance has one source and nobody has checked whether it answers.** *Owner: TechPad
   Gen.* `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the tracker's `/api/summary` — and
   item 10 found the tracker was never paused, so it may simply be working. `fetchSummary` swallows
   the failure either way. **Both ends are one owner's now**, so the hub keeps its no-keys
   property. *LoE: a session.*
3. **Build the `On track` stage.** *Owner: TD.* Agreed 2026-09-17: a fourth phrase and a sixth
   DevOps colour for a branch deployed and waiting on Joel to drive it. **It needs a deliberate
   deploy trigger of its own** now that automatic previews are off — and not an empty commit, which
   the rules forbid. *LoE: a session.*
4. **Build `packages/shared`.** *Owner: TD.* One real copy of the five-way files, a stamping
   script, and `drift` failing a copy that disagrees. *LoE: a session.*
5. **`shared.contacts` needs its write rules said out loud.** *Owner: TD.* Shared on purpose
   between `apps/editor` (TD, frozen) and `apps/tracker` (TechPad Gen). The old premise — one of the
   two is going away — was wrong; neither did, they changed hands. **It is a cross-app contract
   again**, which is the TD's to write down. *LoE: minutes.*
7. **Write the surface guide — site and app.** *Owner: TD.* Joel, 2026-09-18: most tools are
   websites; **Coffee is the only real app**, and Health will be. Site is a thin index grouped by
   verb around a long page; app is one screen, thumb-first, no index. Mockups exist. **It is settled
   at standup**, so `STANDUP.md` gains surface beside the name and the schema. *LoE: a session.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

11. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15. *Owner: TechPad Gen
   as of 2026-09-19*, with the tracker. **#144 closed the guard**, so `/api/cron/*` answers 401 on an
   unset secret instead of admitting everyone — **the ordering this row was written around has
   stopped being load-bearing.** What replaced it is plainer: **`CRON_SECRET` must be set or the
   sweep does not run at all.** Graph stays built and inert, and nothing says so out loud.
   *LoE: minutes.*
