# Paddock — Resume Formatter

Single source of truth for resume content, decoupled from any one saved docx file.
Pure formatting — no AI judgment calls on phrasing or grammar.

Part of [Paddock](../../CLAUDE.md) — see that file for the full system architecture,
shared Supabase project, and the other two tools (Message Editor, Pipeline Tracker).

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

## What's built

- Password gate with lockout (5 failed attempts → 15 minute lock), matching the other Paddock tools
- CRUD endpoints against the `resume` schema: `/api/entries`, `/api/bullets`, `/api/highlights`, `/api/templates`
- Templates are never deleted (no DELETE route by design) — switching `is_active` deactivates the previous one, enforced by a DB constraint too
- `/api/generate` — pulls the active template + current entries/bullets/highlights, builds a `.docx` server-side with the `docx` npm package
- ATS-safety followed: no tables except Career Highlights when a template's `highlights_style` is `table` (flat rows, no merged cells)
- Single-page UI: inline-editable experience entries + bullets, highlights, template list with a "make active" action, and a Generate button

## Not yet built

- No template *field* editor in the UI yet (font, margins, spacing, section order) — API supports it, page doesn't
- No drag-to-reorder for `display_order` — currently set at creation time only
- `resume.techpaddock.io` domain isn't wired up yet
- Hasn't been run through a free ATS-checker against a real generated output yet
- Not yet deployed — needs its own Vercel project (Root Directory `apps/resume`) and the
  `resume.techpaddock.io` DNS record, same steps as Message Editor
