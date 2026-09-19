# Pipeline Tracker — handoff

State as of 2026-09-19.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**The daily sweep's guard fails closed.** `/api/cron/stale-tasks` read `if (secret && …)`, so an
unset `CRON_SECRET` skipped the check and the endpoint was public. It now reads
`if (!secret || …)` and answers 401. The response is byte-identical whether the secret is unset or
merely wrong, so an unauthenticated caller cannot learn which.

**That changes what un-parking ledger item 11 costs.** The order is no longer load-bearing for
safety — setting `MS_GRAPH_*` first no longer publishes an unauthenticated endpoint that writes into
Outlook. What replaced it is a plain requirement: **`CRON_SECRET` must be set or the sweep does not
run at all.** It is no longer optional, and `.env.example` says so.

**Nothing observable changed in production.** `graphConfigured()` is still false, so the route
returned `{skipped}` before and returns 401 now — both do no work. The sweep has still never run for
real.

**`tp-tracker` is not paused.** It builds to production and serves, and its daily cron fires. The
`live: false` field means something else (ledger item 10, Joel's). Do not write anything that
assumes this app is dark.

**The Microsoft Graph integration remains built and inert.** `MS_GRAPH_CLIENT_ID`,
`MS_GRAPH_CLIENT_SECRET` and `MS_GRAPH_REFRESH_TOKEN` are unset, so the calendar, To Do and sweep
all degrade quietly. **Nothing will tell you they are doing nothing.**

**`/api/summary` is untouched** and its carve-out stands: `pathname === "/api/summary"` exactly,
read-only, fails closed, four-second timeout. Counts and singles, never rows.

## Your charter disagrees with your code in three places

Measured on this branch, 2026-09-19. **None is mine to edit** — a charter is Joel's yes — and all
three describe the app as it was before #22:

- **The file map** lists `app/api/draft/`; the route is `app/api/threads/[id]/draft/`. It omits the
  whole dashboard surface — `app/dashboard/`, `app/api/contacts/`, `app/api/threads/[id]/task/`,
  and `lib/{signals,dashboard,summary,matchMeetings,followUpTask,links}.ts`.
- **"Primary view: sorted by days since `last_touch_date`, descending."** It is not. `lib/signals.ts`
  derives an `effective_touch` from messages, renders and meetings that can run *ahead* of the
  hand-recorded date, and `/dashboard` ranks by severity across decay, loose ends, rhythm and
  commitments. The sort is still the product; it is no longer that sort.
- **"The stale threshold is a setting, not a constant."** It is a constant: `DECAY_THRESHOLDS` in
  `lib/signals.ts` hardcodes five per-stage values with no environment override and no UI. The
  code's reasoning is written down and sound. **One of the two is wrong and a session that believes
  the charter will go build a settings page nobody asked for.**

Requested as a ledger row, owner Joel: decide which side is right and correct the loser.

## In flight

`claude/tracker-agent-kickoff-ex4lb6` — the guard fix above, pushed, tests and build green.
**The branch name is the harness's kickoff name, not `claude/tracker-…`.** Standing instructions
for this session forbid pushing to any other branch, so the deviation is deliberate and named here
rather than hidden.

## Next

1. **Verify the daily sweep once the Microsoft credentials exist.** It has never run for real, so
   every claim about it is a claim about code that has not executed — the single largest untested
   surface here. Blocked on Joel un-parking item 11.
2. **The deferred piece:** syncing a completed task back to auto-reset `last_touch_date`. The base
   loop has to be proven working first, so step 1 comes before it.
3. Nothing else is queued. Ask before starting anything larger than a fix.
