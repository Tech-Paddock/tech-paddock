# Resume Formatter — handoff

State as of 2026-10-14.

Read `RULES.md` first. This file is only what is true right now, and its traps. Open work is in
Linear, team TEC, labelled `agent:Resume Formatter`.

---

## What is true now

**The screen is three tabs: Reformat · Resumes · Diagnostics** (the Resumes tab's id is still
`resume`; `resumes`, `templates` and `history` alias it). Reformat is the landing tab and carries
no readouts (Joel, 2026-09-19): the Current Template, the Input Resume, **Reformat and Download**,
and one judgement, **the verdict** (`lib/verdict.ts`). It fails on what happened to *this*
reformat: a source line that reached the output nowhere, a blocking ATS finding, a template
section the source did not fill (`not-found-in-input`), or source text with nowhere to go
(`input-dropped`). `template-trimmed`, `input-not-read` and `feathered` are notes, never votes.

**A PASS downloads on the same click. A FAIL hands out no file** (Joel, 2026-10-14, TEC-105):
`/api/reformat` returns no `docxBase64` and stores no output (`output_file_path` null), so nothing
can offer it later. The render is still recorded — source, coverage, change log, and the ATS
findings in `template_snapshot.findings` — and a red toast points to Diagnostics, which names each
missing line, its section and the render's own reason (`coverage.missingDetail`, written by
`checkContent` from the change log's `lines`). A FAIL also hides the job form: no file was sent.

**Feathering, Professional Experience only** (TEC-107). Each entry carries `lines`, the input's
lines in order. A line the entry did not place — tested by the same run-of-words check coverage
uses — goes in after the line preceding it in the input, as a copy of the nearest template
sibling of its kind (bullet → bullet paragraph, other → header line), logged `feathered`.
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

- **A feathered non-bullet line takes the header line's formatting.** In Joel's template that is
  bold at heading size, so the lint warns it as an `unknown_heading` — a warning, not a vote. Put
  to Joel in the TEC-107 hand-over; the code does what the brief said until he answers.
- **`input-not-read` passes, so the log line, `notRead` and the note are all that say so** —
  `tests/unreadable-highlights.test.ts` pins each.
- **`template-sample.docx` FAILs** on its two blocking findings, so it returns no bytes. A test
  that reads the output goes through `template-flat-sample.docx`.
- **Renders that FAILed before 2026-10-14 still have a stored output**, downloadable from Resumes.
- **`RULES.md` does not yet mention feathering**, and still describes `spec`. Both are the TD's to
  redraft; the code is the truth until then.
- **A reopened render's ATS findings are today's lint** on the stored bytes when there are bytes;
  coverage and the change log are the record.
- **A new database function needs its grants.** `activate_template` revokes PUBLIC and grants
  `service_role` alone — copy that.
- **`extractText` reads run-level `<w:tab/>` as `\t`** and cuts `<w:pPr>` first, so a tab *stop*
  is never text.
- **Experience regroups paragraphs into entries.** Anything else in the section keeps its
  original order, which keeps the XML well formed.
- **Career Highlights never adds or removes a cell.** A count mismatch is logged per cell.
- **The zip-bomb guard counts inflated bytes**, streaming, in `loadDocx` and `readDocxParts`.
- **`String.replace` interprets `$&` even with a string pattern** — splice by index.
- **The tracker write-through is a cross-app contract** (`supabase/README.md`): its faults — UTC
  touch date, a second thread on retry, a note per re-save, no `threadId` check — wait on it.
