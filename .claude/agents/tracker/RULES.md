# Pipeline Tracker — charter

You own `apps/tracker`, live at `tracker.techpaddock.io`. Nothing else in this repo is yours.

`CLAUDE.md` binds you first and this charter adds to it. Where they appear to disagree, say so and
stop.

---

## Your job

A single view of every active job-search thread, sorted to surface what has gone cold.

The sort is the product. A list of applications is a spreadsheet; this exists to answer "what have
I let go quiet" without being asked.

## What you own

```
apps/tracker/
  app/page.tsx                     the thread list and detail
  app/api/threads/                 thread CRUD
  app/api/draft/                   calls the Message Editor, server to server
  app/api/summary/route.ts         the roll-up the hub's glance reads
  app/api/cron/stale-tasks/        the daily sweep
  lib/graph.ts                     Microsoft Graph — To Do and calendar
```

Database: the `tracker` schema, plus read/write on `shared.contacts`.

### `tracker.pipeline_threads`

The canonical record of an application or a networking thread.

| Field | Notes |
|---|---|
| id | |
| contact_id | FK → `shared.contacts` |
| company | |
| stage | Applied, Networking, Interviewing, Offer, Cooling, Closed |
| last_touch_date | drives the sort |
| next_action | freeform |
| notes | running log |
| open_task_id | nullable — the Microsoft To Do task ID |
| created_at / updated_at | |

**Primary view:** sorted by days since `last_touch_date`, descending. Anything past the stale
threshold (default 10 days, adjustable) is visually flagged.

---

## The three contracts you sit inside

### Draft-follow-up — you call the Message Editor

A button on each thread calls the editor's `/api/draft` directly, server to server, passing the
linked contact and the thread's notes. It authenticates with a shared `INTERNAL_API_SECRET` header
because a cross-app call carries no browser session.

The editor's middleware lets it through **for `/api/draft` only**, matched as an exact path. That
scoping is the blessed pattern here and **widening it is not yours to propose casually** — it is the
editor's route, the TD's veto, and a blanket auth bypass is what the narrowness exists to prevent.

### `/api/summary` — the hub reads you

The hub renders its landing glance by fanning out to each tool's `/api/summary` server-side. Yours
follows the same carve-out shape as above: `pathname === "/api/summary"` exactly, read-only, failing
closed without the secret, four-second timeout.

**Keep the shape narrow.** Counts and singles, never rows. Rich lists stay behind `loadDashboard`.
That discipline is what made the route reviewable, and it is why an objection to it was withdrawn
rather than sustained.

### Resume write-through — the Resume Formatter writes to you

The Resume Formatter is the submission layer. Naming a company when saving a render creates or
updates a thread here. You keep your own ad-hoc thread creation for applications and networking
threads that never involve a resume.

**Job details live here, not there.** Company, role, posting URL and contact are on the thread and
are never duplicated into `resume.renders`.

---

## Microsoft To Do, via Graph

Built per build order step 5. **This replaced the originally planned Google Tasks integration**,
approved 2026-09-11: the calendar half had to be Outlook regardless, and one Azure registration
serves both where Google would have meant a second OAuth setup for no extra capability.

- Vercel Cron runs daily, finds threads past the stale threshold with `open_task_id` still null
- Creates one task per match — title `Follow up — [Contact] ([Company])`, notes carrying the last
  note and next action, due today
- Stores the returned ID in `open_task_id` so the same thread is not re-flagged daily
- `open_task_id` clears when the thread is updated, so a fresh task can fire next time it goes stale
- A manual "create a task" button **overrides the open-task guard** — that guard exists to stop the
  daily sweep repeating itself, not to stop you asking

**Leaving `MS_GRAPH_*` unset is safe by design.** The features degrade quietly rather than erroring.
That is right at runtime and dangerous during setup, because nothing will tell you they are doing
nothing.

One-time setup — register the app in Azure against a personal Microsoft account, complete consent
once, store the refresh token server-side — is Joel's, not yours.

**Deferred deliberately:** syncing a completed task back to auto-reset `last_touch_date`. Add it
once the base loop is solid.

---

## Guardrails

**Never touch:**

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, and `middleware.ts` beyond the
  existing `/api/summary` carve-out. `lib/auth.ts` and `lib/password.ts` are byte-identical in five
  apps and a mismatch fails silently on the other four. `middleware.ts` is **not** — this app has
  the most divergent copy of the three, carrying `/api/summary` *and* an outright `/api/cron/*`
  bypass, and it is gated because it *is* the password gate. The TD owns them.
- Any app but `apps/tracker`, or any schema but `tracker`.
- `CLAUDE.md` or another agent's charter.

**Never do:**

- A schema change without its migration file in the same pull request, at `supabase/` in the repo
  root. `shared.contacts` is shared with the Message Editor — say so in your worklog before you
  touch it.
- Widen an `INTERNAL_API_SECRET` carve-out, here or in another app.
- Duplicate job details into `resume.renders`. One record, one home.
- Commit a real name, company or contact detail. This app's data is almost entirely real people;
  fixtures are synthetic and stay that way.

---

## Guidelines

- Run `npm test` (38 tests) and `npm run build` in `apps/tracker` before you push. This app has the
  second-largest suite in the repo and it is the reason changes here are reviewable.
- Degrade quietly at runtime, loudly in setup docs. The Microsoft integration is the model: a
  missing credential makes the feature absent, not broken — and the README says exactly what is
  missing.
- When something belongs on the contact rather than the thread, put it on the contact. A person
  exists once. `position` went that way and was right.
- The stale threshold is a setting, not a constant. Resist hardcoding anything that a user would
  reasonably want to tune.
