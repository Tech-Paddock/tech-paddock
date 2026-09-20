# Open items

**What is open, and who owns the next action. Nothing else.** Shape and budget are in `CLAUDE.md`'s
channel table. It grew to 588 lines once, 401 of them finished work every agent read every session.
**Last reviewed: 2026-09-20.** · **Next number: 26.**

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

3. **Say what `On track` means now that previews are ruled out.** *Owner: Joel.* It was built on a
   preview trigger and you said no to previews, so #156 stripped it back — no fourth phrase, no
   sixth colour. **My recommendation needs no machinery at all: merged and live on the real domain,
   waiting on your verdict**, because merging already deploys in about a minute. Say yes, or say
   what you meant instead. *LoE: minutes.*

25. **Cookbook has no board URL, and its kickoff block is holding a blank for you.** *Owner: Joel.*
   Every other agent's is in `KICKOFF.md`, which is the only place they live. Until you paste one in,
   that agent has been told to put its sign-off in chat and say why — **publishing without a URL
   creates a second board**, and a fortnight of that is thirty pages with no way to tell which is
   current. **Paste it with the manual checklist**, not separately. *LoE: minutes.*

## Waiting on an agent

1. **Fix the login lockout with a shared table — Joel chose it on 2026-09-19 over the firewall
   rate limit.** *Owner: TD.* The counter is a signed cookie the client can drop, and a per-app fix
   is worth nothing since one password opens every app. **The cost he accepted is that the hub gains
   database credentials**, which it has never had. **Its gate is gone**: this is an edit to the
   shared auth files, and #152 landed `packages/shared`, so it is one edit plus a restamp rather
   than one per app. *LoE: a session.*
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

22. **The Health↔Cookbook read contract — Health prices a meal by reading Cookbook.** *Owner: TD.*
   Explicitly not the Cookbook charter's to invent, and not Health's either: it is cross-app, which
   makes it this seat's like the tracker's `/api/summary`. **Design it before either side builds
   against a guess** — a contract changed under a live dependency is what the migration rule exists
   to avoid. Consider it alongside 23; they are one conversation. *LoE: a session.*
23. **Move the grocery list from Health to Cookbook — destructive, so two pull requests.** *Owner:
   TD.* Settled 2026-09-20 that it belongs beside the book: you shop from recipes, not from what you
   ate. **The decision is made; the sequence is not.** Health's `/list` is live and
   `health.grocery_items` may hold rows, so it is stop-using-then-drop, and it touches Health's
   charter and code. **Cookbook may build its own list meanwhile** and has been told not to assume a
   date. *LoE: a session.*
24. **Five liveries, seven apps — two are now worn twice and nothing resolves it.** *Owner: TechPad
   Gen.* Health borrowed `senna` in September on the reasoning that the tracker was being
   deprecated; **item 10 killed that premise** — the tracker is deliberately live. Cookbook has now
   borrowed `clark` from the frozen editor, flagged rather than quiet. **The theme is one owner's on
   purpose**, so this is yours: two more liveries, or a deliberate rule that some apps share.
   *LoE: a session.*

## Parked

Deliberately deferred. **Not background work** — something here moves only when Joel says so.

11. **`CRON_SECRET` and the Microsoft Graph integration.** Parked 2026-09-15. *Owner: TechPad Gen
   as of 2026-09-19*, with the tracker. **#144 closed the guard**, so `/api/cron/*` answers 401 on an
   unset secret instead of admitting everyone — **the ordering this row was written around has
   stopped being load-bearing.** What replaced it is plainer: **`CRON_SECRET` must be set or the
   sweep does not run at all.** Graph stays built and inert, and nothing says so out loud.
   *LoE: minutes.*
