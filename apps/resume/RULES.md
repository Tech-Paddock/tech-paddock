# Resume Formatter — rules

Scope: `apps/resume` (`resume.techpaddock.io`) and the `resume` schema. State and traps are in
`NOTES.md`; open work is in Linear under `app:resume`.

## Purpose

Pour a Jobright-tailored resume's text into the template, check the result, and record when it was
sent. Jobright owns the content; this app owns formatting, verification and history.

Pipeline: upload the tailored `.docx` → read its text → rewrite the template's `word/document.xml`
→ lint the output as a parser reads it → confirm every source line arrived.

## Surface: site

- A thin index grouped by verb, not entity. A tab bar is fine when each tab is a verb and one long
  page.
- One long page over many routes.
- Works on a phone, but is not designed around one-handed use.
- No home-screen install unless the owner grants one; the shape does not change.
- `/admin` and `/debug` never appear in navigation and do not count as screens.

## Core rules

- **No model calls.** A saved render must be reproducible. When a document defeats the rules,
  the report names what it could not account for and a human fixes it.
- **Every string in a render comes from a document** (the source, or the template for passthrough
  sections), never from this app. Labelling assigns roles and
  the content check reports arrival; neither rewrites a word. Jobright's wording is the ATS
  optimisation.
- **Coverage and the verdict never overstate what arrived.** A dropped line counted as placed is
  the failure this design exists to prevent.
- **Coverage does not false-alarm either.** It matches the longest run of consecutive words, not
  whole lines (a line split across cells still arrived) and not loose words (a deleted bullet's
  words occur elsewhere). Both cases have named tests in `tests/compare.test.ts`.
- **Never lose a field to keep its formatting.** Run-granular replacement (company/title/date
  lines, `Label:⇥items` rows) needs one non-empty run per field; where the template lacks them,
  compose the line whole and log the lost formatting.

## The renderer

- **Edit the template; never build a document.** Open the template's zip, rewrite only the body of
  `word/document.xml`, write the same zip back. Every other part is carried through unread.
- Each paragraph keeps its own `pPr` and its first run's `rPr`; only the text changes.
- Modelling the template's formatting in code is a regression, whatever it fixes.
  `tests/reskin.test.ts` asserts `styles.xml`, `numbering.xml` and `theme1.xml` are byte-identical
  to the template's.
- Output is byte-deterministic: the same inputs give the same file.

## Sections

- **Static sections are the template's:** Education, Certifications, Hobbies, and the name and
  contact block pass through untouched (`passthrough`). Edit them in the template.
- **Career Highlights:** if the input matches the template, the table is not written at all.
- **Count mismatches resolve positionally:** surplus input clones the template's last bullet or
  row; unmatched template entries are dropped. Each is a change-log line.
- **Professional Experience is the only section that feathers.** An input line with no slot goes
  in after the line that precedes it in the input, as a copy of the nearest template bullet
  paragraph, glyph included. The header line is the fallback only for a layout with no bullet; it
  reads as a new heading to a person and an ATS. Logged `feathered`, a note, not a vote. Coverage
  checks every Experience line as the input has it.
- **Every other section owns its shape:** a line with no slot stays missing and fails the render.
- **A FAIL hands out no file.**
- A template section the input leaves wholly empty warns. One it fills partly fails, because the
  unfilled slots would ship the template's own text.

## Data

Schema `resume`. Columns are in the migrations under `supabase/`; never put a migration under
`apps/resume/`.

- **Templates:** `is_active` follows the newest upload; pinning an older one shows a persistent
  banner naming both versions.
- Archiving keeps the row and its `.docx`; deleting removes both. Archived and active are disjoint
  by constraint: never make the archived one active. The active template cannot be deleted.
- Deleting a template keeps its renders (`renders.template_id` is `on delete set null`); each
  render's `template_snapshot` records engine, template id, version and sha256.
- The original template bytes are kept and served by `GET /api/templates/[id]/file`, archived or
  not; the template is also the general-purpose resume.
- **Renders** delete one at a time with both stored files. No cascade, no bulk delete.
- **Append-only artifacts:** parsed content, coverage and the rendered file never change.
  `GET /api/renders/[id]/file` returns stored bytes, never a re-render. Application metadata stays
  editable; `submitted_at` stays null until the resume is sent.
- **Storage:** private bucket `resume-files`, under `templates/`, `sources/`, `renders/`. Write the
  file before the row that points at it.

## Parsing traps

- Walk the whole tree; content is not always a direct child of `<w:body>`. Named test.
- Core Competencies may be a table or `Label:⇥items` paragraphs; read both. The template is a file
  the user edits, not a shape to assume. Never flatten a table at render time; that is the
  template's fix.
- `<w:tab>` in a run is a tab character; in `<w:pPr><w:tabs>` it is a tab stop with no text.
- A template may keep the name and contact in `word/header1.xml`. The lint reads header text, not
  part presence. Never reason from what Word displays: a `w:type="first"` header needs
  `<w:titlePg/>` to show, and a parser may skip it either way.
- What a heading is lives in `lib/docx/headings.ts` alone. A heading is a bare label: no date
  range, no interior tab. A job is a line with a date range; a tabbed competency row is not one.
- Heading size is the largest size that recurs among heading candidates, not a fixed value or
  a rank over the whole document. Table and list text is excluded from ranking.
- Jobright pastes Career Highlights as a markdown table. Transpose only when cell counts line up;
  otherwise render verbatim. The `| :--- |` row counts on neither side of coverage.

## ATS rules

- One table at most (Career Highlights). No text boxes, no images (use paragraph borders), no
  contact details in a header or footer, headings from the known vocabulary, a plain bullet glyph.
- These are a lint on the template (`auditAts`), not a constraint on the renderer. A finding on a
  render is a finding about the template: fix it there.
- The renderer never adds a table, text box, image, or header or footer content, and never
  rewrites the document to clear a finding.
- A finding must be believable: a false positive teaches the reader to ignore the warning.

## Testing

- Run `npm test` before every push.
- Never widen an assertion to make a fixture pass; improve the rules or report the document.
- Prefer a named regression test over a comment.
- Golden file: fixed inputs render byte-identical twice.
- ATS lint: unzip the output and assert the rules mechanically.
- Parse fixtures: Jobright exports in, expected sections and 100% coverage out.
- `tests/helpers/fakeSupabase.ts` covers write ordering, branch selection and error mapping, not
  SQL semantics. Indexes and foreign keys are exercised only against the real project.
- Fixtures: `template-sample.docx` carries two blocking findings on purpose (a second table and a
  `<w:sdt>`); `tests/reformat-route.test.ts` asserts they survive. Use `template-flat-sample.docx`
  unless a test needs a defect.
- The Diagnostics message guide (`lib/messageGuide.ts`) moves with `lib/verdict.ts`;
  `tests/message-guide.test.ts` holds them together.
- `GET /api/health` probes database, bucket and active template. A missing
  template reports not-ok at status 200.

## Boundaries

- Never touch the shared auth plumbing, another app, or any schema but `resume`.
- Never commit personal information. In a `.docx` that includes `.rels` targets and `docProps/`.
  Committed fixtures are scrubbed, with synthetic substitutes.
