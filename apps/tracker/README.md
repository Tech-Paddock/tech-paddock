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

## Not yet built

- Google Tasks integration (Vercel Cron + OAuth) — needs Google Cloud Console setup, which is a
  manual step outside what code alone can do
- Manual "create a task" button, independent of the stale check
- Not yet deployed — needs its own Vercel project (Root Directory `apps/tracker`), env vars
  (including `INTERNAL_API_SECRET` matching the editor app), and the `tracker.techpaddock.io` DNS record
