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

1. **Two tokens on `tp-home`, then redeploy.** `GITHUB_TOKEN` fine-grained, this repo, read-only:
   Contents, Metadata, Pull requests, Actions. `VERCEL_TOKEN` read-only, `tech-paddock` team.
   **The redeploy is not optional** — Vercel bakes the environment in at build time. Until both are
   set the Pit Wall runs on repo rows and names the two missing sources under "not reported", which
   is the designed degraded state rather than a failure.
2. **Re-upload the active resume template.** #71 ended re-uploads for *code* changes — the renderer
   now re-extracts from the stored `.docx`. It does nothing about the template file itself, so if
   the active row points at an older design, that is what renders. #67's colours need the current
   file uploaded once.
3. **Confirm Coffee's iOS install works on a real iPhone.** The `apple-touch-icon`, the web-app meta
   tags and the safe-area insets are verified against the built HTML; **whether iOS actually takes
   the icon needs a deploy and a phone.** Open it in Safari, Add to Home Screen, check the icon.
4. **Decide whether to raise the hairline contrast bar.** `--line` against `--surface` is 1.82:1 in
   the theme running in production, short of the 3:1 bar for a non-text component. Every new theme
   matches or beats the shipped figure, and raising the bar **changes the look of all five apps**.
   A decision, not a cleanup.
5. **Morning Paper: polarity or density?** Its two modes are light Dispatch and dark Timing, so the
   switch *is* the polarity switch — contradicting "one livery per app, both polarities" in
   `DECISIONS.md`. Either both densities get both polarities, or amend the decision for the hub.
   **Blocks the build below.**

## Waiting on an agent

Requests with an owner who is not Joel. This is how one agent asks another for something — they
never run at the same time, so it lands here or it does not happen. The owning agent picks it up at
the start of its next session, because the hook prints this file into every one.

1. **Render the drift check in The Garage.** *Owner: TechPad Gen.* `scripts/drift-check.mjs --json`
   emits `{checks: [{name, state, detail}], counts}` where state is `ok` / `warn` / `fail`, and it
   never reports `ok` for something it could not measure. It wants a panel beside Declared and
   Reported, baked at build time the way `collect-declared.mjs` already does — **computed, never
   typed**, which is the property that page exists to protect. The TD wrote the script and the
   contract; the page is yours.
2. **Build the Morning Paper.** *Owner: TechPad Gen.* A third Pit Wall tab — `Board · Feed · Paper`,
   Paper landing — in two densities off one markup tree. The board does not move. The hub holds no
   keys: everything about jobs and mail comes from `tracker`'s `/api/summary`. Joel has the full
   brief and the prototype and pastes them at kickoff. **Waiting on Joel item 5 first.**

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
