# Paddock — Project Brief

techpaddock.io is a personal command center — one shared foundation supporting multiple standalone tools. This brief covers the first three: **Message Editor**, **Pipeline Tracker**, and **Resume Formatter**.

Don't re-litigate the stack choices below without a specific reason — they were chosen deliberately for cost, hand-holding needs, and consistency across tools. Ask before assuming scope beyond what's listed here.

This is a single-user tool. Simplicity beats the multi-team defaults that show up in most infra advice — see the notes on repo layout and training below, both revised down from an earlier, more elaborate first pass once it became clear the extra structure had no one to serve.

---

## Core Architecture Principles

- **One repo, one monorepo layout**: `apps/editor`, `apps/tracker`, `apps/resume`, each with its own `package.json` and each pointed at by its own Vercel project (via that project's Root Directory setting) — so deploys, subdomains, and env vars all stay independent per tool without needing three separate repos, three separate PRs for a shared fix, or three places to remember to look. A `packages/shared` folder holds anything genuinely reused across tools (e.g. the password-gate/session logic) instead of copy-pasting it three times.
- All three share **one Supabase project**, each tool in its own Postgres schema (never the default `public` schema), so table names never collide.
- One deliberately shared table across tools: `contacts` (see Shared Data Model).
- Agent isolation: never point two Claude Code sessions at the same working directory at the same time. One app folder at a time, or genuinely separate worktrees/branches if truly parallel.
- No secrets ever reach the browser. Every Supabase read/write and every Anthropic API call happens through this app's own server-side API routes. The client only ever talks to this app.
- Row Level Security enabled on every table, deny-by-default, even though this is single-user. The server uses Supabase's service role key (which bypasses RLS) for all operations — RLS exists purely as a fallback if a key ever leaks.
- Every deployed app sits behind a password, with lockout after repeated failed attempts. A fully random generated password is the default recommendation; a memorable phrase is an acceptable tradeoff here given the low stakes and the lockout backstop — it's the user's call, not a hard rule.
- **Prefer append over rewrite for anything that accumulates.** When a feature involves a growing body of history (sent messages, logs, past output), the default write path should be a plain insert — cheap, instant, no AI call — with any AI-driven synthesis (like refining a style guide) kept as a separate, deliberately-triggered, batched step. Don't reach for "call the model to regenerate the whole artifact" as the per-event write path; see the Message Editor's training design below for the concrete example.

## Tech Stack

- **Framework:** Next.js, hosted on Vercel
- **Database:** Supabase (Postgres) — one project, multiple schemas
- **AI:** Anthropic API, model `claude-sonnet-5`, own API key, server-side only
- **Domain:** techpaddock.io via Cloudflare Registrar; subdomains via DNS + separate Vercel projects (one per app folder, see Core Architecture Principles)
- **Docx generation** (Resume Formatter only): `docx` npm package, server-side

## Domain Map

| Subdomain | Tool |
|---|---|
| `techpaddock.io` (root) | Command center hub — minimal for now |
| `editor.techpaddock.io` | Message Editor |
| `tracker.techpaddock.io` | Pipeline Tracker |
| `resume.techpaddock.io` | Resume Formatter |

## Environment Variables Needed

```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_TASKS_CLIENT_ID=
GOOGLE_TASKS_CLIENT_SECRET=
GOOGLE_TASKS_REFRESH_TOKEN=
APP_PASSWORD_HASH=
```

---

## Shared Data Model

### `contacts` (shared schema)
| Field | Notes |
|---|---|
| id | |
| name | |
| org | |
| relationship_type | professional / personal, warm / cold |
| preferred_channel | text / email / linkedin / slack |
| notes | freeform |
| created_at / updated_at | |

Written to and read by both the Message Editor and the Pipeline Tracker, so a person exists once — not as drifting duplicate records.

---

## Tool 1: Message Editor (`editor` schema)

Drafts outreach messages (email, Slack, LinkedIn, text) in Joel's own voice, using stored contact context. Has a searchable contact lookup with inline "+ New contact" creation — there's no separate contacts CRUD page; contacts are created and found from right inside the drafting flow.

**Toggles**
- Contact: type-to-search lookup over the shared `contacts` table, or leave unlinked
- Channel: Email / Slack / LinkedIn / Text Message (in that order)
- Purpose: Ask / Follow-up / Decline / Networking / Job outreach / Other
- Tone: free text, optional
- Effort: Quick → Sonnet 5 `effort: low` · Quick+ → `effort: medium` · Thorough → `effort: high`
- Model is Sonnet 5 only. Thinking is adaptive/default on this model — no separate thinking toggle. Hide the reasoning trace from output; return the draft only.

**Modes**
- Output mode: generate a draft from the current style guide + toggles + contact context + free-text input. The draft renders as an editable textarea, not read-only — edit it to match what you actually sent before logging it.
- Logging: "Sent this — log it" appends the edited draft to `message_history` (medium, purpose, tone, content) — a plain insert, no AI call, works with or without a contact linked.
- Training mode: refining the style guide is a separate, deliberate, batched action, not something that runs per logged message (see the append-over-rewrite principle above — folding one message into the guide via an LLM call every time you hit send would drift the rules on a sample size of one). The Train tab has a "Load from logged history" shortcut that pulls the last 30 logged messages into the samples box, or you can paste samples by hand; either way, one Claude call folds the whole batch into the next style-guide version at once.

**Seed style guide rules** (refine over time from logged/uploaded samples):
- Declarative language, not hedged phrasing
- One ask per message, never stacked
- No em dashes
- No "skill set" language
- Warm contacts → text; cold professional contacts → LinkedIn DM; email when a direct address exists
- Odd-time scheduled sends read more human than round numbers

**Tables**
- `message_history`: id, contact_id (FK, nullable), medium, purpose, tone (nullable), content, sent_at
- `style_guide`: id, version, content, updated_at — each refine inserts a new version rather than overwriting, so past guides stay recoverable

---

## Tool 2: Pipeline Tracker (`tracker` schema)

Single view of every active job-search thread, sorted to surface what's gone cold.

### `pipeline_threads`
| Field | Notes |
|---|---|
| id | |
| contact_id | FK → contacts |
| company | |
| stage | enum: Applied, Networking, Interviewing, Offer, Cooling, Closed |
| last_touch_date | |
| next_action | freeform |
| notes | running log |
| open_task_id | nullable — Google Task ID, see below |
| created_at / updated_at | |

**Primary view:** sorted by days since `last_touch_date`, descending. Threads past the stale threshold (default 10 days, adjustable) are visually flagged.

**Draft-follow-up integration:** a button on each thread calls the Message Editor's drafting endpoint directly, passing the linked contact's full context (contact record + message_history + this thread's notes) — no re-entering anything.

**Google Tasks integration** (direct API call, no middleman automation platform):
- Vercel Cron runs daily, checks `pipeline_threads` for anything past the stale threshold with `open_task_id` still null
- For each match: creates a Google Task — title `Follow up — [Contact] ([Company])`, notes include the thread's last note + next_action, due today
- Stores the returned task ID in `open_task_id` so the same thread isn't re-flagged daily
- `open_task_id` clears when the thread is updated, so a fresh task can fire next time it goes stale
- Manual "create a task" button also available on any thread, independent of the stale check
- One-time setup: register app in Google Cloud Console, complete OAuth consent once, store refresh token server-side
- **Deferred:** syncing a completed Google Task back to auto-reset `last_touch_date` — add once the base loop is solid

**Seed contacts/threads to load once built:** Cloud for Good, SaltClick, Growth Heroes, Attain, RedPoint, Christine Pallen, Elisa Salina.

---

## Tool 3: Resume Formatter (`resume` schema)

Single source of truth for resume content, decoupled from any one saved docx file. **Pure formatting — no AI judgment calls on phrasing or grammar.**

### `resume_entries` (jobs/roles)
id, company, title, start_date, end_date (or "Present"), display_order

### `resume_bullets`
id, entry_id (FK), content, display_order

### `resume_highlights` (Career Highlights section)
id, content, display_order

### `resume_templates`
id, name, is_active (boolean — exactly one true at a time; switching is deliberate, never automatic; old templates are never deleted), font, font_size, margins, section_order, spacing, `highlights_style` (enum: `table` | `list`, defaults to `list`)

**Generation logic:**
- Pull whichever template has `is_active = true`, plus current entries/bullets/highlights
- Build the `.docx` server-side with the `docx` npm package, following the active template's rules

**ATS-safety rule:** avoid tables generally — many ATS parsers read raw XML order, not visual order, and content inside table cells gets scrambled or dropped.

**Exception:** Career Highlights may render as a table when `highlights_style = 'table'`, since that content is intentionally repeated in the body bullets — a parser losing that specific table loses nothing new. Keep it structurally simple if used: flat rows/columns, no merged cells, no nesting. Run one generated output through a free ATS-checker before trusting it on live applications.

---

## Build Order

1. ~~Monorepo scaffolding + shared Supabase project and schemas~~ — done, though the single Message
   Editor app currently sits at the repo root rather than under `apps/editor` yet; move it under the
   monorepo layout above when Pipeline Tracker scaffolding starts, rather than as a separate step
2. ~~Message Editor core loop: toggles, drafting call, style guide, contact lookup/creation~~ — done,
   live at editor.techpaddock.io
3. Pipeline Tracker: thread CRUD, stale-sort view, draft-follow-up integration
4. Resume Formatter: structured content CRUD, template CRUD, docx generation
5. Google Tasks integration for the tracker (OAuth setup + Vercel Cron)
6. ~~Domain wiring: Cloudflare DNS → Vercel~~ — done for Message Editor; repeat per subdomain as each
   tool goes live
7. ~~Password gate~~ — done for Message Editor; RLS is already on deny-by-default across every table
   in every schema from step 1, so this is really just "repeat the password gate" per tool now
8. Real-device testing (add to iPhone home screen via each subdomain)
