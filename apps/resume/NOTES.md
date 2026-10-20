# Resume — notes

Current state and traps. Rules are in `RULES.md`; open work is in Linear under `app:resume`.

## State

- Tabs: Reformat · Resumes · Diagnostics. The Resumes tab's id is `resume`; `resumes`,
  `templates` and `history` alias it.
- Reformat shows the current template, the input, **Reformat and Download**, and the verdict
  (`lib/verdict.ts`). Diagnostics runs the same check (`checkContent`).
- Resumes is one list (`/api/resumes`), filtered Template / Input / Output; a render is up to two
  rows sharing its id. Templates are added and activated there.
- **Verdict FAIL:** a missing source line, a blocking ATS finding, `input-dropped`, or a section
  filled partly (`not-found-in-input` beside an entry that wrote source text to that section).
  **Notes only:** `template-trimmed`, `input-not-read`, `feathered`, a wholly empty section.
- A FAIL returns no `docxBase64`, stores no output, and hides the job form. It still records
  source, coverage, change log and findings (`template_snapshot.findings`); Diagnostics lists each
  missing line from `coverage.missingDetail`.
- A source heading with no section is `input-dropped`; its text is in `unplacedSections[].texts`.
- Career Highlights cells that do not pair as one metric and one description are `input-not-read`.
- *Open* reopens a render from its stored record, never a re-render. An unreadable record is NO
  VERDICT (`lib/storedRender.ts`).
- `templates.spec` is nullable and unused. Activation is one transaction,
  `resume.activate_template`. No client for `shared`.
- No tracker. The `tracker` schema and `renders.thread_id` are dropped, and
  `tests/no-tracker.test.ts` keeps them out; a render records only `submitted_at`, set by **Mark as sent**
  (`PATCH /api/renders/[id]`, which takes nothing else). The Resumes list shows no company or stage.
- Next.js 16, React 19, `proxy.ts` on the Node runtime. Route handlers await `params`; tests pass
  `Promise.resolve({ id })`. No route opts into a cache.

## Traps

- `templates.version` is max+1 over all rows, so deleting the newest lets its number be reused.
  Harmless: renders keep `template_snapshot`.
- A reopened render's verdict and ATS findings are recomputed now, so it can read differently
  from when it ran. Coverage and the change log do not change.
- `input-not-read` passes; only its log line, `notRead` and the note show it.
- `template-sample.docx` FAILs and returns no bytes; read output through
  `template-flat-sample.docx`.
- Renders that failed before FAIL blocked downloads still have stored output.
- A new database function needs grants: copy `activate_template` (revoke PUBLIC, grant
  `service_role`).
- Experience regroups paragraphs into entries. Career Highlights never adds or removes a cell.
- Next 14 ignores `proxy.ts` silently; `package.json`, lockfile and gate file move together.
- `next build` rewrites `tsconfig.json`; commit what it writes.
- The zip-bomb guard counts inflated bytes, streaming, in `loadDocx` and `readDocxParts`.
- `String.replace` interprets `$&` even with a string pattern; splice by index.
