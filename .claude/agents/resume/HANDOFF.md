# Resume Formatter — handoff

State as of 2026-09-26.

Read `RULES.md` first. This file is only what is true right now, and its traps. Open work is in
Linear, team TEC, labelled `agent:Resume Formatter`.

---

## What is true now

**The screen is three tabs: Reformat · Resume · Diagnostics, and Reformat is the landing tab.**
Reformat carries no readouts (Joel, 2026-09-19) — pick, drop, reformat, download, log where it
went — and one judgement, **the verdict** (`lib/verdict.ts`). It fails on what happened to *this*
reformat: a source line that reached the output nowhere, a blocking ATS finding, a template
section the source did not fill (`not-found-in-input`), or source text with nowhere to go
(`input-dropped`). **A template line the source had no counterpart for is `template-trimmed`: a
note, never a vote.** Log each drop as what it is, or the verdict either cries wolf or overstates.

**A stored render reopens with its own record.** Either of its rows on the Resume tab has *Open*,
which calls `GET /api/renders/[id]` and shows it on Reformat and Diagnostics: coverage from
`renders.coverage`, the change log from `renders.template_snapshot`, read as written and never
re-rendered; the download is the stored file. **An unread record is NO VERDICT, never PASS**
(`lib/storedRender.ts`): no stored log or coverage, or a log using the retired `trimmed-surplus`.
A render already logged to a tracker thread says so instead of offering the job form again.

**Diagnostics checks the lines a reformat takes** (`linesTaken`), not the whole source. A source it
takes nothing from is compared whole, so zero lines checked never reads as 100%.

**The Resume tab is one list**, `/api/resumes`, uncapped, filtered Template / Input / Output. A
render is two rows sharing its id, so deleting either deletes both files; every write reloads.

**The engine** rewrites only the body of `word/document.xml` and writes the same zip back, and
**the output is byte-deterministic**, so `content_hash` identifies a render. Joel's template
audits clean. Run-granular rewrites edit each run where it sits, so a `<w:hyperlink>`, bookmark or
content control around a rewritten run survives with its relationship id.

**What a heading is lives in `lib/docx/headings.ts` alone.** A source heading with no section here
**ends the section before it** and is reported as `SourceContent.unplacedSections` and an
`input-dropped` line.

**The old pipeline is gone**: `spec.ts`, `label.ts`'s `labelParagraphs`, and their tests. The two
helpers the engine still asks — `looksLikeContact`, `isAlignmentRow` — are in `lib/docx/lines.ts`.
**`templates.spec` is nullable, and nothing writes or reads it**; existing rows keep theirs until
the column is dropped (TEC-63's second pull request).

**Activating a template is one transaction**: `resume.activate_template`, called through
`lib/templates.ts` by the upload and the PATCH. An unknown id changes nothing; an archived target
rolls back whole on the check constraint.

**This app holds no client for `shared`** (TEC-26), and a test fails if app or lib code names it.

**The fixtures carry no real timeline** — see `tests/fixtures/README.md`.

## Traps specific to this app

- **Unreadable Career Highlights pass the verdict (TEC-79).** A pipe table whose rows do not pair
  up extracts as null, the renderer logs `kept-unchanged`, and those lines count nowhere.
- **A reopened render's ATS findings are today's lint** on the stored bytes — they were never
  stored. Coverage and the change log are the record; the findings are not.
- **A new database function needs its grants.** Postgres grants EXECUTE to PUBLIC, which means
  `anon`; the default privileges cover tables only. `activate_template` revokes it and grants
  `service_role` alone — copy that.
- **`RULES.md` still describes `spec`** — the column, extraction on upload, the header-size
  machinery. It is the TD's to redraft; the code is the truth until then.
- **`extractText` reads run-level `<w:tab/>` as `\t`** and cuts `<w:pPr>` first, so a tab *stop*
  is never text. The run-granular rewrite's gap logic reads `<w:t>` only.
- **Experience regroups paragraphs into entries.** Anything else in the section — an `<w:sdt>`
  opener or closer, a bookmark, a table — keeps its original order, which keeps the XML well formed.
- **Career Highlights never adds or removes a cell.** A count mismatch is logged per cell.
- **The zip-bomb guard counts inflated bytes**, streaming, in `loadDocx` and `readDocxParts`.
- **`String.replace` interprets `$&` even with a string pattern** — splice by index.
- **The tracker write-through is a cross-app contract** (`supabase/README.md`): its faults — UTC
  touch date, a second thread on retry, a note per re-save, no `threadId` check — wait on it.
