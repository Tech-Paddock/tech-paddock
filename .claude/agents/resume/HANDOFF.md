# Resume Formatter — handoff

State as of 2026-10-18.

Read `RULES.md` first. This file is only what is true right now, and its traps. Open work is in
Linear, team TEC, labelled `agent:Resume Formatter`.

---

## What is true now

**The screen is three tabs: Reformat · Resumes · Diagnostics** (the Resumes tab's id is still
`resume`; `resumes`, `templates` and `history` alias it). Reformat is the landing tab and carries
no readouts (Joel, 2026-09-19): the Current Template, the Input Resume, **Reformat and Download**,
and one judgement, **the verdict** (`lib/verdict.ts`). It fails on what happened to *this*
reformat: a source line that reached the output nowhere, a blocking ATS finding, source text
with nowhere to go (`input-dropped`), or a section the source filled only in part (Highlights
cells keeping the template's figures). `template-trimmed`, `input-not-read`, `feathered` and a
section the source left wholly empty are notes (Joel, 2026-10-18: "Whole sections only"). Partial
is read from the log: `not-found-in-input` beside an entry that wrote source text to that section.

**A PASS downloads on the same click. A FAIL hands out no file** (Joel, 2026-10-14, TEC-105):
`/api/reformat` returns no `docxBase64` and stores no output (`output_file_path` null), so nothing
can offer it later. The render is still recorded — source, coverage, change log, and the ATS
findings in `template_snapshot.findings` — and a red toast points to Diagnostics, which names each
missing line, its section and the render's own reason (`coverage.missingDetail`, written by
`checkContent` from the change log's `lines`). A FAIL also hides the job form: no file was sent.

**Feathering, Professional Experience only** (TEC-107). Each entry carries `lines`, the input's
lines in order. A line the entry did not place — tested by the same run-of-words check coverage
uses — goes in after the line preceding it in the input, as a copy of the nearest template
**bullet** paragraph, glyph included, bullet or not (Joel, 2026-10-18), logged `feathered`.
Coverage checks every Experience line, not only the fields read out of it. Every other section
is unchanged: a line with no slot stays missing and fails.

**The template is added on the Resumes tab**, with its Save and activate step (TEC-104).

**Unpairable Career Highlights are `input-not-read`: named, never a vote** (Joel, 2026-09-29,
TEC-87 option 3). Pipe or Word table, every cell is one metric and one description or none is read.

**A stored render reopens with its own record** via *Open* on either row: coverage and change log
read as written, never re-rendered. **An unread record is NO VERDICT, never PASS**
(`lib/storedRender.ts`). A FAIL with no output reopens from its recorded findings, no download.

**Diagnostics checks what Reformat checks** (`checkContent`). The Resumes tab is one list,
`/api/resumes`, filtered Template / Input / Output; a render is up to two rows sharing its id.

**The engine** rewrites only the body of `word/document.xml`; the output is byte-deterministic.
Joel's template audits clean. **What a heading is lives in `lib/docx/headings.ts` alone**; a
source heading with no section ends the section before it and is `input-dropped`, its text kept in
`unplacedSections[].texts` so Diagnostics can list it.

**`templates.spec` is nullable, and nothing writes or reads it** (TEC-63's second pull request
drops it). **Activating a template is one transaction**, `resume.activate_template`. **This app
holds no client for `shared`** (TEC-26). **The fixtures carry no real timeline.**

## Traps specific to this app

- **A feathered role line carries the bullet glyph.** That is Joel's pick read literally; the
  header line is the fallback only when no template entry has a bullet at all.
- **A reopened render's verdict is today's `verdictFor` over its stored log**, so an older render
  that failed only on a wholly empty section now reads PASS with a note. Its record is unchanged.
- **`input-not-read` passes, so the log line, `notRead` and the note are all that say so** —
  `tests/unreadable-highlights.test.ts` pins each.
- **`template-sample.docx` FAILs** on its two blocking findings, so it returns no bytes. A test
  that reads the output goes through `template-flat-sample.docx`.
- **Renders that FAILed before the download block shipped keep their stored output** (Joel,
  2026-10-18: history), downloadable from Resumes.
- **`RULES.md` still describes `templates.spec` and `extractSpec`**, gone from code: TD's to redraft.
- **A reopened render's ATS findings are today's lint** on the stored bytes when there are bytes;
  coverage and the change log are the record.
- **A new database function needs its grants.** `activate_template` revokes PUBLIC and grants
  `service_role` alone — copy that.
- **Experience regroups paragraphs into entries.** Anything else in the section keeps its
  original order, which keeps the XML well formed.
- **Career Highlights never adds or removes a cell.** A count mismatch is logged per cell.
- **The zip-bomb guard counts inflated bytes**, streaming, in `loadDocx` and `readDocxParts`.
- **`String.replace` interprets `$&` even with a string pattern** — splice by index.
- **The tracker write-through is a cross-app contract** (`supabase/README.md`): its faults — UTC
  touch date, a second thread on retry, a note per re-save, no `threadId` check — wait on it.
