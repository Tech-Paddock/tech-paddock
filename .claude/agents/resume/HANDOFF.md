# Resume Formatter — handoff

State as of 2026-09-25.

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
note, never a vote.** The two drops shared one action until TEC-31 and the verdict failed the
repo's own fixture pair at full coverage — so log each drop as what it is, or the verdict either
cries wolf or overstates. An end-to-end test runs that pair through the route's pipeline.

**Diagnostics checks the lines a reformat takes** (`linesTaken`, as the reformat route does), not
the whole source, which it leaves partly behind by design. A source it takes nothing from is
compared whole, so zero lines checked never reads as 100%.

**The Resume tab is one list**, `/api/resumes`, uncapped, filtered Template / Input / Output. A
render is two rows sharing its id, so deleting either deletes both files; every write reloads.

**The engine** rewrites only the body of `word/document.xml` and writes the same zip back, and
**the output is byte-deterministic**: the rewritten entry keeps the template's own zip timestamp
and no folder entry is added, so `content_hash` identifies a render. Joel's template audits clean.

**What a heading is lives in `lib/docx/headings.ts` alone** — the vocabulary, the date range and
the lookups. `reskin/sections.ts` and the ATS lint read it; `spec.ts`'s run-shape test is
`isTrioLine`, which is about reading the trio's formatting and is not a heading rule. A source
heading with no section here (known like "Projects", or unknown but set at the recurring heading
size) **ends the section before it** and is reported as `SourceContent.unplacedSections` and an
`input-dropped` line.

**The old builder is gone** (`build.ts`, the `docx` package). `spec.ts` still fills
`templates.spec` on upload and nothing renders from it; `labelParagraphs` is reached only by tests.

**The change log is stored** in `renders.template_snapshot` with the template's id, version and
hash. The screen does not read it back, so after a reload the verdict and Diagnostics show only
what `renders.coverage` holds.

**The fixtures carry no real timeline** — see `tests/fixtures/README.md`.

## Traps specific to this app

- **`extractText` reads run-level `<w:tab/>` as `\t`** and cuts `<w:pPr>` first, so a tab *stop*
  is never text. The run-granular rewrite's gap logic reads `<w:t>` only — it is what gets
  overwritten, and a tab there would be written into the text twice.
- **Experience regroups paragraphs into entries.** Anything else in the section — an `<w:sdt>`
  opener or closer, a bookmark, a table — is kept in its original order, leading ones before the
  entries and the rest after. Order among those markers is what keeps the XML well formed.
- **Career Highlights never adds or removes a cell.** A count mismatch is logged per cell:
  `not-found-in-input` for a template figure left standing, `input-dropped` for a highlight with
  no cell.
- **A run-granular rewrite keeps the runs and drops what wrapped them.** `replaceInlineHeaderLine`
  and `replaceLabelledLine` rebuild a paragraph as `head + runs`, so a `<w:hyperlink>` on a
  rewritten line loses its link while its text survives. Harmless on the current template.
- **The zip-bomb guard counts inflated bytes**, streaming, in `loadDocx` (the upload) and
  `readDocxParts`. Never trust a declared size — the uploader chose it.
- **`String.replace` interprets `$&` even with a string pattern** — splice by index.
- **The tracker write-through is a cross-app contract** (`supabase/README.md`): its faults — UTC
  touch date, a second thread on retry, a note per re-save, no `threadId` check — wait on it.
- **Activating a template is still two writes** — clear, then set — because the partial unique
  index allows no single PostgREST update; one step needs a database function.
