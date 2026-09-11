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

## Your branch: `claude/tracker-dashboard-concept-r6p9up`

Seven commits ahead, three behind. Fourth in the merge queue. It touches `apps/editor`,
`apps/home`, `apps/resume`, `apps/tracker` and `CLAUDE.md` — a wide blast radius, so declare it.

### The part that is blocked

**Your `/api/summary` fan-out is not approved and must not merge without Joel's decision.**

The design: every tool exposes `/api/summary`, and the hub fans out server-side over
`INTERNAL_API_SECRET`. The concern is specific and it is not about code quality. Today that secret
unlocks exactly one route. The brief says it is "scoped tightly to that one route in editor's
middleware, never a blanket auth bypass." Your change turns it into a shared key across routes on
four apps.

It may well be the right call. But it is an architecture change to the authentication story, not a
feature, and it gets reviewed as one. **Green CI is not sufficient for this branch.** Put the case
to Joel — what the alternative would cost, why the fan-out shape is right — and let him decide.

The narrow-shape discipline in your own design notes is good and worth keeping in the pitch: counts
and singles, never rows; the rich lists stay behind `loadDashboard`, which only the tracker calls.

### The conflict you will cause

You rewrite `apps/home/app/page.tsx` from a client component to a server component (`HomeShell` +
`loadGlance`). The `this-n2kl8y` branch adds a topbar subtitle to the version you are deleting.
Your structure wins, but **tell TechPad Gen rather than letting their change vanish** — their
subtitle needs re-applying on top of your rewrite.

You also edit `CLAUDE.md`. Under the current rules you may not: flag the contradiction in the PR and
stop. The brief is approved before it is updated, not alongside the code.

## What you must not touch

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, anything touching
  `SESSION_SECRET`. Byte-identical in four apps; a mismatch fails silently. The TD owns them.
- Schema changes without a migration file in the same PR. The Supabase agent owns the database.
- `CLAUDE.md`.

## Next steps

1. Make the case for `/api/summary` to Joel. That is the gate on your branch.
2. Coordinate the `page.tsx` rewrite with TechPad Gen.
3. Remove your `CLAUDE.md` edits from the branch and raise them as a flag instead.

## Not built yet — build order step 5

**Google Tasks integration.** Vercel Cron runs daily, finds threads past the stale threshold with
`open_task_id` still null, creates a Google Task per match (title `Follow up — [Contact]
([Company])`, notes carrying the last note and next action, due today), and stores the returned ID
so the same thread is not re-flagged. `open_task_id` clears when a thread is updated. A manual
"create a task" button exists independently of the stale check.

One-time setup — register the app in Google Cloud Console, complete OAuth consent, store the refresh
token server-side — is Joel's, not yours. `GOOGLE_TASKS_*` env vars are named in the brief but not
referenced in code yet.

Deferred deliberately: syncing a completed Google Task back to reset `last_touch_date`. Add it once
the base loop is solid.
