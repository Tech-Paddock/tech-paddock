# Paddock — Project Brief

techpaddock.io is a personal command center — one shared foundation supporting multiple standalone tools. This brief covers the first three: **Message Editor**, **Pipeline Tracker**, and **Resume Formatter**.

Don't re-litigate the stack choices below without a specific reason — they were chosen deliberately for cost, hand-holding needs, and consistency across tools. Ask before assuming scope beyond what's listed here.

This is a single-user tool. Simplicity beats the multi-team defaults that show up in most infra advice — see the notes on repo layout and training below, both revised down from an earlier, more elaborate first pass once it became clear the extra structure had no one to serve.

---

## Core Architecture Principles

- **One repo, one monorepo layout**: `apps/editor`, `apps/tracker`, `apps/resume`, and `apps/home`
  (the hub at the root domain), each with its own `package.json` and each pointed at by its own Vercel project (via that project's Root Directory setting) — so deploys, subdomains, and env vars all stay independent per tool without needing three separate repos, three separate PRs for a shared fix, or three places to remember to look. **`packages/shared` was never created.** `lib/auth.ts` and `lib/password.ts` are
  byte-identical copies in all four apps, and `lib/supabase.ts` is a per-app variant. That is a
  deliberate-looking outcome of building app by app, not a decision anyone recorded — the cost is
  that a session or lockout fix needs the same edit four times. Worth consolidating before the
  auth logic changes again; not worth churn otherwise.
- All three share **one Supabase project**, each tool in its own Postgres schema (never the default `public` schema), so table names never collide.
- One deliberately shared table across tools: `contacts` (see Shared Data Model).
- **Never commit personal information.** No names, addresses, phone numbers, email addresses,
  employers, schools, or resume content in the repo — test fixtures are scrubbed copies with
  synthetic substitutes, and that includes hyperlink targets in `.rels` parts and the author
  fields in `docProps/`. Scan every part of a `.docx` before committing it, not just
  `document.xml`.
- Agent isolation: never point two Claude Code sessions at the same working directory at the same time. One app folder at a time, or genuinely separate worktrees/branches if truly parallel.
- No secrets ever reach the browser. Every Supabase read/write and every Anthropic API call happens through this app's own server-side API routes. The client only ever talks to this app.
- Row Level Security enabled on every table, deny-by-default, even though this is single-user. The server uses Supabase's service role key (which bypasses RLS) for all operations — RLS exists purely as a fallback if a key ever leaks.
- **One login covers every subdomain.** The session cookie is scoped to `.techpaddock.io`, so
  signing in on any app signs you in on all of them, and `/api/logout` on the hub clears it
  everywhere. This requires `SESSION_SECRET` to be byte-identical across all four Vercel
  projects — a mismatch makes the other apps silently reject a valid session. The three tools
  also send `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` so only the
  hub can embed them.
- Every deployed app sits behind a password, with lockout after repeated failed attempts. A fully random generated password is the default recommendation; a memorable phrase is an acceptable tradeoff here given the low stakes and the lockout backstop — it's the user's call, not a hard rule.
- **Prefer append over rewrite for anything that accumulates.** When a feature involves a growing body of history (sent messages, logs, past output), the default write path should be a plain insert — cheap, instant, no AI call — with any AI-driven synthesis (like refining a style guide) kept as a separate, deliberately-triggered, batched step. Don't reach for "call the model to regenerate the whole artifact" as the per-event write path; see the Message Editor's training design below for the concrete example.

---

## Rules of Engagement

Several agents build here in parallel and none of them can see each other. They are never running
at the same time, so there is no way to ask another agent anything. Every rule below exists because
something already went wrong when an agent acted reasonably without knowing what another agent
knew: three branches editing this file at once, six schema migrations that lived only in the
database, a Vercel project pointed at the repo root and serving an unprotected page to the public,
and real contact names committed to the file that forbids committing names.

### Before you write anything

**Run `bash .claude/worklogs/read-all.sh`.** It prints the open-items ledger and every agent's
worklog from every branch. If someone has already claimed a file you were about to touch, say so in
your own worklog and in your pull request before you touch it.

Then open your own worklog at `.claude/worklogs/<your-branch>.md` and claim your work. Close it
before you finish. The format is in `.claude/worklogs/README.md` and is deliberately short.

Your worklog is not a second commit message. Commits here already explain what was done and why, at
length, and they do it well. The worklog carries only what a commit cannot: what you are working on
*right now*, what you are blocked on, what you decided that affects somebody else, and what you
need from the technical director. If an entry could have been a commit message, make it one.

### Never, without the technical director

- **Push to `main`.** Every change goes through a pull request, including small ones.
- **Create or delete a Vercel project, add or remove a domain, or change a DNS record.** These have
  no undo and no test catches them. A wrong DNS record takes all four subdomains down and you find
  out from a browser.
- **Apply a schema change without its migration file in the same pull request.** The database is
  not allowed to be the only record of its own shape again. See `supabase/README.md`.
- **Edit the shared auth plumbing** — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, or
  anything touching `SESSION_SECRET` and the shared cookie. These are byte-identical copies in four
  apps, and a mismatch does not throw. It silently rejects valid sessions on the other three.
- **Edit this file.** If your change contradicts the brief, say so in the pull request and stop.
  The brief is approved before it is updated, never quietly alongside the code that outdated it.
- **Commit personal information or secrets.** Names, employers, schools, addresses, contact
  details, resume content. For a `.docx` that means every part of the archive, not just
  `document.xml` — hyperlink targets in `.rels` and the author fields in `docProps/` too.
- **Make a check pass by weakening it.** No skipping or disabling a test, no loosening an
  assertion, no `supabase migration repair`, no empty commit to re-trigger CI. When something is
  red, either the code is wrong or the check is wrong. Say which one, and fix that.

Allowed without asking: changing build settings on a Vercel project that already exists — Node
version, environment variables, ignored build step. Those are reversible and visible. The line is
between configuring something that exists and creating, destroying, or re-pointing it.

### Always

- One branch per change, named for the change. Never reuse a branch across unrelated work, and
  never treat one as a permanent working branch.
- State your blast radius in the pull request: which apps, which shared files.
- Add any new app under `apps/` to the CI matrix in `.github/workflows/ci.yml` in the same pull
  request. The matrix is hardcoded to four names and silently skips anything else, so a new app
  ships untested and nothing tells you.

### When you think the instruction is wrong

Say so, at a high level, and **stop**. Do not flag a concern and proceed anyway — a warning
attached to work already done is not a warning, it is a receipt.

If the answer is "go anyway", go fully, and do not relitigate the decision three commits later.

Going fully is not going blindly. Ask whatever you need in order to execute it correctly.
Relitigating a settled decision is out; asking how to do it properly is expected.
### Merging

- **Squash merge, always.** One commit on `main` per change. Branch-level history stays in the pull
  request if it is ever wanted. Merge commits and rebase merges are off.
- **CI green before merge** — all four matrix jobs. A red build does not get merged on the
  assumption that the failure is unrelated. Establish that it is, or fix it.
- **Delete the branch after merge**, so the branch list stays a list of live work rather than an
  archive.

Main collected sixteen merge commits from a single reused branch before any of this was written
down. To be precise about what went wrong, because the fix depends on it: fifteen pull requests
were merged, #1 through #15, so it is not that pull requests were never used. They all reused the
one branch `claude/this-n2kl8y`, and several merged within six to ten seconds of opening — #11
opened at 01:35:23 and merged at 01:35:29 — far too fast for CI to have reported. The gate existed
and was walked straight through. Everything after 2026-09-10 skipped pull requests altogether.

### One-time GitHub settings

These live in the GitHub UI rather than the repo, so they have to be set by hand, once.

Settings → General → Pull Requests: allow squash merging only (uncheck merge commits and rebase
merging), set the squash commit message default to "Pull request title and description", and turn
on "Automatically delete head branches".

Then protect `main` (Settings → Rules → Rulesets, or Settings → Branches): require a pull request
before merging, require the four CI checks to pass, and block force pushes.

**Until that second half is done, every rule above is convention rather than enforcement** — an
agent that ignores "never push to `main`" will simply succeed. This repo is private on a personal
account, and protecting a branch on a private repo may require a paid plan; that is unverified, and
it is the single most load-bearing open question on the ledger.

## Tech Stack

- **Framework:** Next.js, hosted on Vercel
- **Database:** Supabase (Postgres) — one project, multiple schemas
- **AI:** Anthropic API, model `claude-sonnet-5`, own API key, server-side only — Message Editor
  only. **The Resume Formatter makes no model calls and is not going to.** Labelling is fully
  deterministic on both document families (see Tool 3), so there is nothing for a model to decide,
  and a call would cost the reproducibility that makes a saved render a trustworthy record of what
  was sent. When a document defeats the rules the coverage report says so and you fix it by hand.
- **Domain:** techpaddock.io via Cloudflare Registrar; subdomains via DNS + separate Vercel projects (one per app folder, see Core Architecture Principles)
- **Docx generation** (Resume Formatter only): `docx` npm package, server-side
- **Docx reading** (Resume Formatter only): `jszip` + `fast-xml-parser` — the `docx` package only
  writes, and both the template and the Jobright upload have to be read back

## Domain Map

| Subdomain | Tool | Vercel project | Status |
|---|---|---|---|
| `techpaddock.io` (root) | Command center hub (`apps/home`) | `tp-home` | live |
| `editor.techpaddock.io` | Message Editor | `tp-message-editor` | live |
| `tracker.techpaddock.io` | Pipeline Tracker | `tp-tracker` | live |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` | live |

All four deploy from this one repo, separated by Root Directory. Project names carry a `tp-` prefix
and do not match their folder or subdomain — verified against the Vercel account on 2026-09-11, and
the prefix stays. Renaming five live projects to make a table tidier is backwards; the table gets
corrected instead.

There is a fifth project, **`tp-coffee-app`**, created by Vercel's import-suggestion flow and
pointed at the repo root rather than at an app. It builds nothing and serves an empty page publicly
at `tech-paddock.vercel.app`, outside the password gate — the gate lives in each app's middleware,
so a project with no app has no gate. It is to be fixed in place, not deleted: Root Directory to
`apps/coffee`, framework Next.js, env vars added. Blocked until `apps/coffee` exists on `main`.

## Environment Variables Needed

```
SUPABASE_URL=                 # all apps that talk to Postgres
SUPABASE_SERVICE_ROLE_KEY=    # ditto
APP_PASSWORD_HASH=            # bcrypt hash of the login password — all four apps
SESSION_SECRET=               # all four apps, and MUST be byte-identical across them
ANTHROPIC_API_KEY=            # editor only — the resume app makes no model calls
INTERNAL_API_SECRET=          # editor + tracker only (server-to-server draft call)
EDITOR_BASE_URL=              # tracker only
GOOGLE_TASKS_CLIENT_ID=       # not referenced in code yet — build order step 5
GOOGLE_TASKS_CLIENT_SECRET=
GOOGLE_TASKS_REFRESH_TOKEN=
```

`SESSION_SECRET` is separate from `APP_PASSWORD_HASH` on purpose: bcrypt salts randomly per app, so
the same password produces a different hash in each project and the hash can't double as a signing
key. Every app throws on startup if `SESSION_SECRET` is unset.

---

## Shared Data Model

### `contacts` (shared schema)
| Field | Notes |
|---|---|
| id | |
| name | |
| org | |
| position | job title / role at org — optional, like org. Drafting context for the Message Editor |
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

**Model drift check:** `lib/modelCheck.ts` runs inside `/api/login` after a successful password
check — there is no scheduled-job infrastructure, and login is a fine cadence for a personal tool.
It compares the Sonnet-family model IDs returned by Anthropic's Models API against the last-seen
set in `editor.model_status` and flags newly-appeared IDs in an amber banner on the Draft page. It
never swaps the pinned model automatically: a new model can carry API-shape changes worth reading
first (exactly what happened when `effort` moved under `output_config`).

**Tables**
- `message_history`: id, contact_id (FK, nullable), medium, purpose, tone (nullable), content, sent_at
- `model_status`: last-seen model IDs + `pinned_model`, written by the drift check above
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

**Where threads come from:** the Resume Formatter is the submission layer — filling in the job
details when rendering a resume creates or updates the thread here. The tracker is the dashboard,
and keeps its own ad-hoc thread creation for applications and networking threads that never
involve a resume.

**Seed contacts/threads:** loaded directly into the project on 2026-09-08 — five org-linked threads
and two named contacts. The names stay out of the repo under the no-personal-information rule
above, which covers migrations and briefs as much as it covers docx fixtures; that seed migration
is deliberately not checked in. See `supabase/README.md`.

---

## Tool 3: Resume Formatter (`resume` schema)

Reformats a Jobright-tailored resume into Joel's own template, optimized for ATS readability, and
records the submission. **Not a content store** — Jobright authors and tailors the content; this
tool owns formatting, history, and the application record. **Pure formatting — no AI judgment
calls on phrasing or grammar.** Both inputs are `.docx`, output is `.docx`; there is no
copy-paste path.

**Why it exists:** Jobright does the tailoring and the ATS keyword work, but its output formatting
is unusable — every run bold+italic, section rules rendered as images, a mangled Education
section, and ~900KB of direct formatting on a two-page resume.

**Pipeline:** upload a Jobright `.docx` → extract paragraphs deterministically → label them →
render into the active template → review the coverage report → save, with the application details
written through to the tracker.

### `templates`
id, version, name, `file_path` (original docx in Supabase Storage), `spec` (jsonb — extracted
formatting), is_active, created_at

Append-only; templates are never deleted. `is_active` auto-points at the newest upload, and
pinning an older one is deliberate — it raises a persistent banner on the render screen naming
both versions. The template file is itself a deliverable: it doubles as the general-purpose resume
to hand someone when there is no specific job, so the original bytes are kept, not just the spec.

### `renders`
id, template_id, template_snapshot, `source_file_path` (the Jobright upload), `parsed_content`
(jsonb), `coverage` (jsonb), `output_file_path`, content_hash, `thread_id` (FK →
`tracker.pipeline_threads`, nullable), `submitted_at` (nullable), created_at

Document artifacts are append-only — parsed content, coverage, and the rendered file never change
once written. Application metadata stays editable, since a resume is usually rendered days before
it is submitted, and `submitted_at` stays null until it actually goes out. Job details (company,
role, posting URL, contact) live on the linked tracker thread and are never duplicated here.

**Lossless rule:** labelling moves text, it never rewrites it. Every string comes from the source
docx; labelling only assigns each paragraph a role. Content loss is therefore structurally
impossible rather than something to verify after the fact — which matters because Jobright's
specific wording *is* the ATS optimization, and a silently dropped line is lost keyword coverage.

**Labelling is deterministic, and there is no model in this tool.** Jobright's export is machine
generated and highly regular — run size alone separates the name, headings, entry lines and body,
since its `styles.xml` defines no named styles whatsoever. Sizes are *ranked* rather than
hardcoded, because the template's scale is completely different and it sets its Career Highlights
metrics larger than its own headings. Both fixtures label at 100% coverage.

A model escalation was designed and then dropped. It would have had nothing to decide, and it would
have made output non-deterministic, which is exactly what a saved render must not be. The signal
that would have triggered it is still worth having and still measured — coverage below 100%, or an
`unknown_heading` finding — but it now surfaces in the UI for a human rather than routing to a
model. If a document defeats the rules, the coverage report names what it could not place.

**Parser note:** content is not always a direct child of `<w:body>` — the template keeps its
Core Competencies inside a `<w:sdt>` content control, and Career Highlights inside a table cell.
Walk the tree, never just the body's direct children, or whole sections read as empty.

**Coverage report** — surfaced in the UI after every render, not just in tests: percentage of
source paragraphs placed, any dropped text quoted in full, unrecognized headers, and the map from
source header to rendered section.

**Generation logic:**
- Pull whichever template has `is_active = true`, plus the labeled content from the upload
- Build the `.docx` server-side with the `docx` npm package, following the active template's rules

**ATS-safety rule:** avoid tables generally — many ATS parsers read raw XML order, not visual
order, and content inside table cells gets scrambled or dropped. Also: no text boxes, no images
(Jobright draws its section rules as images — use real paragraph borders instead), contact details
in the document body and never in a Word header or footer, section headings from a known
vocabulary, and a plain `•` bullet glyph.

**Exception:** Career Highlights renders as a table. That content is intentionally repeated in the
body bullets, so a parser losing that specific table loses nothing new, and the content is
natively two-column (`metric: description`). Flat rows, no merged cells, no nesting. Enforced by
the ATS lint test below: exactly one table is permitted, and one anywhere else fails.

**Storage:** originals, uploads and rendered output live in the private `resume-files` bucket, under
`templates/`, `sources/` and `renders/`. Files are written before the row that points at them, so a
row never references an object that was never created.

**Health check:** `GET /api/health` probes the database, the storage bucket, the tracker schema and
the active template, and names whichever is unhappy. A missing template reports as not-ok but keeps
the endpoint at 200 — that is a setup step, not a broken dependency.

**Testing** — CI runs `npm run test --if-present` before each build. Database and Storage calls are
covered with a query-builder double (`tests/helpers/fakeSupabase.ts`), which tests write ordering,
branch selection and error mapping but deliberately not SQL semantics; the partial unique index and
the foreign keys are only ever exercised against the real project:
- Golden file: fixed content + fixed spec renders byte-identical twice (this is what makes a saved
  render trustworthy as a record of what was actually sent)
- ATS lint: unzip the generated docx and assert the rules above mechanically
- Parse fixtures: real Jobright exports in, expected sections and 100% coverage out
- Spec fixtures: real template docx in, expected font/margins/spacing out

---

## Build Order

1. ~~Monorepo scaffolding + shared Supabase project and schemas~~ — done; Message Editor lives
   under `apps/editor`, Resume Formatter under `apps/resume`, matching the layout above
2. ~~Message Editor core loop: toggles, drafting call, style guide, contact lookup/creation~~ — done,
   live at editor.techpaddock.io
3. ~~Pipeline Tracker: thread CRUD, stale-sort view, draft-follow-up integration~~ — done and
   deployed at tracker.techpaddock.io. Draft-follow-up calls Message Editor's `/api/draft`
   server-to-server using a shared `INTERNAL_API_SECRET` header (set identically on both apps),
   since it's a cross-app call with no browser session to carry — scoped tightly to that one
   route in editor's middleware, never a blanket auth bypass
4. **Resume Formatter — rebuilt and live.** Reformat (template + tailored resume → .docx),
   Templates (upload, version, activate), History (past renders, redownload what was actually
   sent, log a submission) and an ATS check for any single file. Renders persist to
   `resume.renders`, and naming a company writes the thread through to Pipeline Tracker. Still
   open: linking a render to a shared contact, and a run through a free ATS-checker against real
   generated output. The model escalation was considered and dropped — see Tool 3.
   Original note kept for context — **it was being rebuilt because** The original build (structured content CRUD + template
   CRUD + docx generation) was the wrong shape: it assumed the app authored resume content. It
   doesn't — Jobright does. Rebuilding as a reformatter per the section above; the auth, password,
   and Supabase plumbing survive, the content schema and its CRUD do not. The Vercel project, env
   vars, and DNS are all already in place and the old build is live — so this is a replacement in
   place, not a first deploy. Still needs a run through a free ATS-checker against real generated
   output.
5. Google Tasks integration for the tracker (OAuth setup + Vercel Cron)
6. ~~Domain wiring: Cloudflare DNS → Vercel~~ — done for all four subdomains
7. ~~Password gate~~ — done on all four apps, now with the shared-cookie SSO described above. RLS is
   on deny-by-default across every table in every schema from step 1
8. Real-device testing (add to iPhone home screen via each subdomain)
