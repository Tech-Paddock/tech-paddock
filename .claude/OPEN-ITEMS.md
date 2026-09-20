# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-20.** · **Next number: 22.**

**Numbers are permanent and the gaps are correct** — the rule is in `CLAUDE.md`, which every session
loads anyway, and why the run starts where it does is in `DECISIONS.md`.

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

3. **Do you still want to drive a branch before it merges? `On track` was only ever that.**
   *Owner: Joel.* It existed as the one controlled exception to previews being off, so ruling
   previews out removed it; #156 stripped it back to nothing. **The gap is real** — every other
   stage is answered by reading a diff, which tells you nothing about a phone app. **Three answers,
   all fine**: merged-and-live-waiting-on-your-verdict, which needs no machinery; a real preview,
   which needs preview env vars and a Supabase branch so it is not reading production; or close it
   and keep merge-then-look. The story is in `DECISIONS.md`. *LoE: minutes.*

21. **The Cookbook is its own app and its own schema. #151 is closed and
   `claude/health-recipes` is kept on purpose — do not delete that branch.** *Owner: Joel.* Settled
   2026-09-20: named, themed as a cookbook, and **Health reads it to price a meal** rather than
   owning recipes. **The branch is the only written record of the design**, and #151's closing
   comment says what carries over and what dies with the `health.items` link. **Surface is still
   open**, the TD's read being site over app — the test is in `.claude/SURFACE.md`, which answers
   the Cookbook as its worked example and leaves the call yours. **Needs `STANDUP.md` step 1.** *LoE: a session.*

## Waiting on an agent

1. **Fix the login lockout with a shared table — Joel chose it on 2026-09-19 over the firewall
   rate limit.** *Owner: TD.* The counter is a signed cookie the client can drop, and a per-app fix
   is worth nothing since one password opens all six. **The cost he accepted is that the hub gains
   database credentials**, which it has never had. **Its gate is gone**: this is an edit to the
   shared auth files, and #152 landed `packages/shared`, so it is one edit plus a restamp rather
   than six. *LoE: a session.*
2. **The hub's glance has one source and nobody has checked whether it answers.** *Owner: TechPad
   Gen.* `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the tracker's `/api/summary`, and
   **the tracker is deliberately live**, so it may simply be working. `fetchSummary` swallows the
   failure either way. **Both ends are one owner's now**, so the hub keeps its no-keys property.
   *LoE: a session.*
5. **`shared.contacts` needs its write rules said out loud.** *Owner: TD.* Shared on purpose
   between `apps/editor` (TD, frozen) and `apps/tracker` (TechPad Gen). The old premise — one of the
   two is going away — was wrong; neither did, they changed hands. **It is a cross-app contract
   again**, which is the TD's to write down. *LoE: minutes.*

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
