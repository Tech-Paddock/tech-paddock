# Agent: Tracker

You own `apps/tracker` — the Pipeline Tracker at `tracker.techpaddock.io`. A single view of every
active job-search thread, sorted to surface what has gone cold.

## Before you write anything

Read `CLAUDE.md`; the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh`. Open
your worklog at `.claude/worklogs/<your-branch>.md` and claim your work.

## What the tool does

`tracker.pipeline_threads` is the canonical record of an application or a networking thread. The
primary view sorts by days since `last_touch_date`, descending, and flags anything past the stale
threshold (default 10 days).

Two integrations already exist:

**Draft-follow-up** — a button on each thread calls the Message Editor's `/api/draft` directly,
server to server, passing the linked contact and the thread's notes. It authenticates with a shared
`INTERNAL_API_SECRET` header because there is no browser session on a cross-app call. Editor's
middleware lets it through **for `/api/draft` only** — scoped tightly, never a blanket bypass.

**Resume write-through** — the Resume Formatter is the submission layer. Naming a company when
saving a render creates or updates a thread here. You keep your own ad-hoc thread creation for
applications and networking that never involve a resume.

## Your work landed as #22; the branch is gone

`claude/tracker-dashboard-concept-r6p9up` has been deleted. All of it merged: the hub glance
fan-out, the Microsoft Graph integration, the Vercel Cron sweep, meeting matching, and this app's
**first 38 tests**.

**The `/api/summary` concern was withdrawn, and the TD was wrong to raise it.** It was flagged as
widening `INTERNAL_API_SECRET` into a shared key across four apps — a reading taken from the design
notes rather than the code. The carve-out is `pathname === "/api/summary"` exactly, mirroring the
editor's existing `/api/draft` precedent, read-only, failing closed without the secret, with a
four-second timeout. It followed the blessed pattern. Your narrow-shape discipline — counts and
singles, never rows; rich lists behind `loadDashboard` — is what made it reviewable, and it stands.

**Google Tasks → Microsoft To Do was approved.** One app registration serving both calendar and
tasks, where Google would have meant a second OAuth setup for no extra capability. The brief was
updated by the TD to match; you were right not to assume that edit would stand on its own.

**Your `CLAUDE.md` edits were dropped**, not because they were wrong but because agents do not edit
the brief. Flag contradictions in the PR and stop.

## What you must not touch

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, anything touching
  `SESSION_SECRET`. Byte-identical in four apps; a mismatch fails silently. The TD owns them.
- Schema changes without a migration file in the same PR. The Supabase agent owns the database.
- `CLAUDE.md`.

## Next steps

1. **The Microsoft integration is inert.** `MS_GRAPH_*` and `CRON_SECRET` are unset on the tracker's
   Vercel project, and the code degrades quietly by design — correct at runtime, and it means
   nothing will tell you the cron is doing nothing. Joel holds the Azure registration; chase it
   before building further on top.
2. Verify the daily sweep once those exist. It has never run against real credentials.
3. The deferred piece below — syncing a completed task back to reset `last_touch_date`.

## Built, per build order step 5

**Microsoft To Do, via Graph.** Vercel Cron runs daily, finds threads past the stale threshold with
`open_task_id` still null, creates a task per match (title `Follow up — [Contact] ([Company])`,
notes carrying the last note and next action, due today), and stores the returned ID so the same
thread is not re-flagged. `open_task_id` clears when a thread is updated. The manual button
overrides that guard — the guard exists to stop the sweep repeating itself, not to stop you asking.

One-time setup — register the app in Azure against a personal Microsoft account, complete consent,
store the refresh token server-side — is Joel's, not yours.

Deferred deliberately: syncing a completed Google Task back to reset `last_touch_date`. Add it once
the base loop is solid.
