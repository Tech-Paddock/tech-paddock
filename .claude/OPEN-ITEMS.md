# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-22.** · **Next number: 30.**

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

28. **`CLAUDE.md` is 521 of 530 lines — the next rule anyone adds fails `drift`, and the file
   forbids raising a cap to fit content.** *Owner: TD.* The target is settled: the sign-off spec,
   27.9% of the file, replaced by `scripts/sign-off.mjs`. **The script needs the ledger restructured
   first** — it currently parses 9 items of 10, silently. `DECISIONS.md` has both. *LoE: a session.*

## Waiting on Joel

3. **Do you still want to drive a branch before it merges? `On track` was only ever that.**
   *Owner: Joel.* **The gap is real** — every other stage is answered by reading a diff, which says
   nothing about a phone app. **Three answers, all fine**: merged-and-live-waiting-on-your-verdict,
   free; a real preview, costing preview env vars and a Supabase branch; or close it and keep
   merge-then-look. Why it has no mechanism left is in `DECISIONS.md`. *LoE: minutes.*

## Waiting on an agent

1. **Fix the login lockout with a shared table — Joel chose it on 2026-09-19 over the firewall
   rate limit.** *Owner: TD.* The counter is a signed cookie the client can drop, and a per-app fix
   is worth nothing since one password opens every app. **The cost he accepted is the hub gaining
   database credentials**, which it has never had. **Its gate is gone** — `packages/shared` landed
   in #152, so this is one edit plus a restamp. *LoE: a session.*
2. **The hub's glance has one source and nobody has checked whether it answers.** *Owner: TechPad
   Gen.* `SOURCES` in `apps/home/lib/glance.ts` holds one entry, the tracker's `/api/summary`, and
   **the tracker is deliberately live** — so it may simply be working. *LoE: a session.*
5. **`shared.contacts` needs its write rules said out loud.** *Owner: TD.* Shared on purpose
   between `apps/editor` (TD, frozen) and `apps/tracker` (TechPad Gen). The old premise — one of the
   two is going away — was wrong; neither did, they changed hands. **It is a cross-app contract
   again**, which is the TD's to write down. *LoE: minutes.*

20. **An app that reads outside its own folder silently stops rebuilding, and nothing checks.**
   *Owner: TD.* #145 fixed **the hub**, not the class. A `drift` rule comparing what a build reads
   against what its `ignoreCommand` watches would catch the next one. *LoE: minutes.*

22. **The Health↔Cookbook read contract — Health prices a meal by reading Cookbook.** *Owner: TD.*
   Not Cookbook's to invent and not Health's: it is cross-app, which makes it this seat's like the
   tracker's `/api/summary`. **Design it before either side builds against a guess.** Consider it
   alongside 23; they are one conversation. *LoE: a session.*
23. **Move the grocery list from Health to Cookbook — destructive, so two pull requests.** *Owner:
   TD.* Settled 2026-09-20 that it belongs beside the book: you shop from recipes, not from what you
   ate. **The decision is made; the sequence is not** — `/list` is live, so it is stop-using-then-drop,
   and it touches Health's charter. **Cookbook builds its own meanwhile.** *LoE: a session.*
24. **Five liveries, seven apps — two are now worn twice and nothing resolves it.** *Owner: TechPad
   Gen.* Health borrowed `senna` on a premise item 10 killed; Cookbook has now borrowed `clark` from
   the frozen editor, flagged rather than quiet. Two more, or a rule that some share. *LoE: a session.*
26. **Three migration filenames disagree with the versions actually recorded.** *Owner: TD.*
   `20260919175624`, `20260919185800`, `20260919220112`. **Renaming is the honest direction** — the
   database is the record of what ran. The first is named in Coffee's handoff, so that one needs
   Coffee. Why it happens is in `DECISIONS.md`. *LoE: minutes.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

11. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15. *Owner: TechPad Gen
   as of 2026-09-19*, with the tracker. #144 closed the guard, so the ordering this row was written
   around stopped being load-bearing. What replaced it is plainer: **`CRON_SECRET` must be set or
   the sweep does not run at all.** Graph stays built and inert. *LoE: minutes.*
