# Paddock — Message Editor

Drafts outreach messages (text, email, LinkedIn, Slack) in your own voice, using stored
contact context and a style guide that refines itself from writing samples you upload.

Part of [Paddock](./CLAUDE.md) — see that file for the full system architecture,
shared Supabase project, and the other two tools (Pipeline Tracker, Resume Formatter).

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the blanks — see below
npm run dev
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `SUPABASE_URL` | already filled in `.env.example` — the shared `tech-paddock` project |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → tech-paddock → Settings → API → `service_role` secret |
| `APP_PASSWORD_HASH` | a bcrypt hash of your chosen password — see command in `.env.example` |

## What's built

- Password gate with lockout (5 failed attempts → 15 minute lock)
- Draft endpoint (`/api/draft`) — pulls style guide + contact + message history, calls Claude
- Style guide training endpoint (`/api/style-guide`) — folds new writing samples into the rules
- Contact CRUD (`/api/contacts`) against the shared `contacts` table
- Single-page UI: Draft mode (toggles + free text → draft) and Train mode (paste samples → refined guide)
- Deployed on Vercel (`editor-paddock` project, linked to this repo's `main` branch) with all
  four environment variables set
- Live at **editor.techpaddock.io**, DNS via Cloudflare

## Not yet built

- `message_history` isn't written to automatically after a send — currently read-only from the draft endpoint
- No UI for editing/adding contacts yet (API supports it, page doesn't)
- No seed contacts or writing samples loaded yet — style guide is still the generic seed rules from CLAUDE.md
- Pipeline Tracker and Resume Formatter (the other two Paddock tools) haven't been started
- Google Tasks integration — not applicable to this tool; belongs to Pipeline Tracker
