# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-19.** · **Next number: 22.**

**Numbers are permanent.** A closed item's row is deleted and its number is never used again, so the
gaps below are correct rather than something to tidy. A new item takes `Next number` and increments
it. **Why the run starts where it does is in `DECISIONS.md`**, not restated here.

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

18. **`DECISIONS.md` is full — 260/260, and three copies of its ceiling disagree.** *Owner: Joel.*
   **Its header's trimming rule exists and has never fired.** Raise the ceiling, or bound by relevance. *LoE: minutes.*

21. **Recipes become their own app; #151 is held at the gate until they do.** *Owner: Joel.*
   Health's recipe book is built and green on `claude/health-recipes`. **Do not merge it** —
   `recipes.item_id` is a live FK into `health.items`, so merging makes the extraction destructive.
   **Needs a name and a solutioning session**, `STANDUP.md` step 1. *LoE: minutes to decide.*

## Waiting on an agent

1. **Fix the login lockout with a shared table — Joel chose it on 2026-09-19 over the firewall
   rate limit.** *Owner: TD.* The counter is a signed cookie the client can drop, and a per-app fix
   is worth nothing since one password opens all six. **The cost he accepted is that the hub gains
   database credentials**, which it has never had. **Do 4 first** — this is an edit to the shared
   auth files, and after `packages/shared` it is one edit rather than six. *LoE: a session.*
2. **The hub's glance has one source and nobody has checked whether it answers.** *Owner: TechPad
   Gen.* `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the tracker's `/api/summary`, and
   **the tracker is deliberately live**, so it may simply be working. `fetchSummary` swallows the
   failure either way. **Both ends are one owner's now**, so the hub keeps its no-keys property.
   *LoE: a session.*
3. **Build the `On track` stage.** *Owner: TD.* Agreed 2026-09-17: a fourth phrase and a sixth
   DevOps colour for a branch deployed and waiting on Joel to drive it. **It needs a deliberate
   deploy trigger of its own** now that automatic previews are off — and not an empty commit, which
   the rules forbid. **Joel asked for it on 2026-09-19.** *LoE: a session.*
4. **Build `packages/shared`.** *Owner: TD.* One real copy of the five-way files, a stamping
   script, and `drift` failing a copy that disagrees. **Joel asked for it on 2026-09-19**, and it
   is the gate for 1. **It brings back the all-six deploy on purpose**: every app's `ignoreCommand`
   already watches `packages`, so the first real file there rebuilds all six at once — which is
   correct, because a shared auth file does affect all six. *LoE: a session.*
5. **`shared.contacts` needs its write rules said out loud.** *Owner: TD.* Shared on purpose
   between `apps/editor` (TD, frozen) and `apps/tracker` (TechPad Gen). The old premise — one of the
   two is going away — was wrong; neither did, they changed hands. **It is a cross-app contract
   again**, which is the TD's to write down. *LoE: minutes.*
7. **Write the surface guide — site and app.** *Owner: TD.* Joel, 2026-09-18: most tools are
   websites; **Coffee is the only real app**, and Health will be. Site is a thin index grouped by
   verb around a long page; app is one screen, thumb-first, no index. Mockups exist. **It is settled
   at standup**, so `STANDUP.md` gains surface beside the name and the schema. *LoE: a session.*

20. **An app that reads outside its own folder silently stops rebuilding, and nothing checks.**
   *Owner: TD.* #137 scoped each build to its own folder; the hub reads `.claude` at build time, so
   four merges stranded the Pit Wall on an hours-old ledger with nothing red. #145 fixed **the hub**
   — not the class. A `drift` rule comparing what a build reads against what its `ignoreCommand`
   watches would catch the next one. *LoE: minutes.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

11. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15. *Owner: TechPad Gen
   as of 2026-09-19*, with the tracker. **#144 closed the guard**, so `/api/cron/*` answers 401 on an
   unset secret instead of admitting everyone — **the ordering this row was written around has
   stopped being load-bearing.** What replaced it is plainer: **`CRON_SECRET` must be set or the
   sweep does not run at all.** Graph stays built and inert, and nothing says so out loud.
   *LoE: minutes.*
