# Paddock — Resume Formatter

Reformats a Jobright-tailored resume into Joel's own template, optimized for ATS readability,
and records the submission. It does **not** store or author resume content — Jobright does that.
This tool owns formatting, history, and the application record.

Part of [Paddock](../../CLAUDE.md) — see that file for the full system architecture, the shared
Supabase project, and the other three apps.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the blanks — see below
npm run dev
npm test                     # 52 tests, no database needed
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | already filled in `.env.example` — the shared `tech-paddock` project |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → tech-paddock → Settings → API → `service_role` secret |
| `APP_PASSWORD_HASH` | a bcrypt hash of your chosen password — see command in `.env.example` |
| `SESSION_SECRET` | any random string, but **byte-identical across all four apps** or the shared login breaks |

No `ANTHROPIC_API_KEY` — this app makes no model calls (see below).

## The four tabs

| Tab | What it does |
|---|---|
| Reformat | Active template + a tailored resume → a `.docx`, with a coverage report and an ATS check run on the output |
| Templates | Upload, version, activate. Never deletes; pinning an older version raises a banner |
| History | Past renders, redownload exactly what was sent, log a submission |
| Check | Any single `.docx` → ATS findings and what the parser understood |

## How it works

`lib/docx/` is the whole engine, and none of it needs a database:

- `read.ts` — unzips a `.docx`, with typed errors for a renamed PDF or a missing document part
- `paragraphs.ts` — every paragraph in document order with its structural signals. Walks the
  whole tree, never just the body's direct children: content hides inside `<w:sdt>` content
  controls and table cells, and reading only the top level makes whole sections look empty
- `spec.ts` — a template's formatting. Sizes are *ranked*, never hardcoded; the two document
  families use completely different scales
- `label.ts` — paragraphs into structured content, reporting coverage. Moves text, never rewrites it
- `build.ts` — writes the output document
- `ats.ts` — the ATS rules as mechanical findings

## No model calls

The Anthropic SDK is not a dependency here. Labelling is fully deterministic and hits 100%
coverage on both document families, so a model call would have nothing to decide — and it would
cost the reproducibility that makes a saved render a trustworthy record of what was sent.

`claude-opus-5` is reserved for an escalation path that is measured but not wired: coverage below
100%, or an `unknown_heading` finding. Wire it when a real document defeats the rules.

## Testing

`npm test` runs everything; CI runs it before each build. Database and Storage calls use a
query-builder double (`tests/helpers/fakeSupabase.ts`) covering write ordering, branch selection
and error mapping — but deliberately not SQL semantics. The partial unique index and the foreign
keys only mean anything against the real project.

Fixtures in `tests/fixtures/` are real documents scrubbed of all personal information.

## Not yet done

- Not run through a free ATS-checker against real generated output
- No link from a render to a shared `contacts` record
- `/api/health` exists but has no UI surface
