# Paddock — Pipeline Tracker

Single view of every active job-search thread, sorted to surface what's gone cold.

Part of [Paddock](../../CLAUDE.md) — see that file for the full system architecture,
shared Supabase project, and the other two tools (Message Editor, Resume Formatter).

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the blanks — see below
npm run dev
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | already filled in `.env.example` — the shared `tech-paddock` project |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → tech-paddock → Settings → API → `service_role` secret |
| `APP_PASSWORD_HASH` | a bcrypt hash of your chosen password — see command in `.env.example` |
| `EDITOR_BASE_URL` | already filled in — the Message Editor's URL |
| `INTERNAL_API_SECRET` | any random string — must match the same variable on the editor app exactly |

## What's built

- Password gate with lockout, matching the other Paddock tools
- Thread CRUD (`/api/threads`) against `tracker.pipeline_threads`
- Read-only contacts endpoint (`/api/contacts`) — for linking threads and showing names, not editing
- Primary view sorted by days-since-last-touch, descending; threads past 10 days are flagged
- Editing a thread (stage, date, next action, notes) clears `open_task_id`, so a future stale check
  isn't blocked by a task created before the edit
- Draft-follow-up (`/api/threads/[id]/draft`) — calls Message Editor's `/api/draft` server-to-server
  (a shared `INTERNAL_API_SECRET` header, not a browser session), passing the linked contact and
  this thread's notes automatically. Purpose is always "follow-up"; medium defaults to the
  contact's `preferred_channel` or email

## Built since, and what is still missing

**Microsoft To Do via Graph**, not Google Tasks — one app registration serves both Outlook calendar
and tasks, where Google would have meant a second OAuth setup for no extra capability. A daily
Vercel Cron sweeps stale threads and creates a task per match; the manual button exists too and
overrides the open-task guard.

**It is inert.** `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_REFRESH_TOKEN` and
`CRON_SECRET` are unset on the Vercel project, and the code degrades quietly by design — correct at
runtime, and it means nothing will tell you the cron is doing nothing. Needs a one-time Azure
registration against a personal Microsoft account.

Still missing:

- Syncing a completed task back to auto-reset `last_touch_date` — deferred until the base loop has
  actually run against real credentials
- Deployed and live at **tracker.techpaddock.io**; this app also exposes `/api/summary` for the
  hub's glance
