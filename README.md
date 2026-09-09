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
- Commit endpoint (`/api/commit`) — logs a final (edited) draft to `message_history` for that
  contact and folds it into the style guide as a tagged sample (medium/purpose/tone, not the
  original prompt or contact identity)
- Contact CRUD (`/api/contacts`) against the shared `contacts` table, plus a searchable
  contact lookup and inline "+ New contact" form in the UI
- Single-page UI: Draft mode (contact search, channel, purpose, tone, effort, free text →
  editable draft → commit to training) and Train mode (paste a batch of samples → refined guide)
- Deployed on Vercel (`editor-paddock` project, linked to this repo's `main` branch) with all
  four environment variables set
- Live at **editor.techpaddock.io**, DNS via Cloudflare

## Not yet built

- No seed contacts or writing samples loaded yet — style guide is still the generic seed rules from CLAUDE.md
- Pipeline Tracker and Resume Formatter (the other two Paddock tools) haven't been started
- Google Tasks integration — not applicable to this tool; belongs to Pipeline Tracker
