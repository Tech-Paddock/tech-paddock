# Pipeline Tracker — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**`tracker.techpaddock.io` is live and serving current `main`.** Everything this agent has built is
merged; nothing is in flight and no branch of yours exists. **38 tests pass** — the second-largest
suite in the repo, and the reason changes here are reviewable.

**The Microsoft Graph integration is built and inert.** `MS_GRAPH_CLIENT_ID`,
`MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_REFRESH_TOKEN` and `CRON_SECRET` are all unset on `tp-tracker`,
so `graphConfigured()` is false and the calendar, To Do and daily sweep all degrade quietly by
design. **That is correct at runtime and it means nothing will tell you the cron is doing nothing.**

**It is parked, not forgotten, and un-parking is the dangerous moment.** Your `middleware.ts` waves
`/api/cron/*` past the password gate and the route's own guard reads `if (secret && …)` — an unset
`CRON_SECRET` skips the check entirely and the endpoint is public. It is harmless *only* because the
next line returns early while Graph is unconfigured. **So `CRON_SECRET` is set first, then a
redeploy, and only then `MS_GRAPH_*`.** Setting the Graph credentials first publishes an
unauthenticated endpoint that writes into Joel's Outlook on demand. This is in the ledger under
Parked and moves only when Joel says so.

**Your `/api/summary` carve-out stands.** It was once flagged as widening `INTERNAL_API_SECRET`
across four apps — read from design notes rather than from the route — and the objection was
withdrawn. It is `pathname === "/api/summary"` exactly, read-only, fails closed without the secret,
four-second timeout. **Your narrow-shape discipline is what made it reviewable.**

## The three contracts you sit inside

None of them is unilaterally yours. You call the Message Editor's `/api/draft`; the hub reads your
`/api/summary`; the Resume Formatter writes threads into your table when a render names a company.

**Job details live here, not there** — company, role, posting URL and contact are on the thread and
are never duplicated into `resume.renders`. One record, one home.

**Keep `/api/summary` to counts and singles, never rows.** Rich lists stay behind `loadDashboard`.

## Traps specific to this app

- **Never widen an `INTERNAL_API_SECRET` carve-out**, here or in another app. A blanket auth bypass
  is what the narrowness exists to prevent.
- **Degrade quietly at runtime, loudly in setup.** The Microsoft integration is the model: a missing
  credential makes the feature absent, not broken — and that is exactly why nothing will tell you it
  is absent.
- **`open_task_id` clears when a thread is updated**, so a fresh task can fire next time it goes
  stale. The manual button deliberately overrides the open-task guard — that guard exists to stop
  the daily sweep repeating itself, not to stop you asking.
- **The stale threshold is a setting, not a constant.** Resist hardcoding anything a user would
  reasonably want to tune.
- **This app's data is almost entirely real people.** Fixtures are synthetic and stay that way.

## In flight

Nothing.

## Next

1. **Verify the daily sweep once the Microsoft credentials exist.** It has never run for real, so
   every claim about it is a claim about code that has not executed. That is the single largest
   untested surface you own — and it is blocked on Joel un-parking the item above, in that order.
2. **The deferred piece:** syncing a completed task back to auto-reset `last_touch_date`. The base
   loop needs to be proven working first, which means step 1 comes before this.
3. Nothing else is queued. Ask before starting anything larger than a fix.
