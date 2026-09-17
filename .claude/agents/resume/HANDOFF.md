# Resume Formatter — handoff

State as of 2026-09-17.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**The engine is merged and live.** `tp-resume`'s production deployment runs the reskin renderer:
the template's zip is opened, only the body of `word/document.xml` is rewritten, and the same zip is
written back out. #96 shipped it, #97 corrected the ledger row that described it.

**The real template has now been run through it, and it works.** Everything before 2026-09-17 was
measured against a fixture whose scrub had hoisted every paragraph's text into its first run — the
one shape that cannot exercise run-granular replacement. Against the actual template: 100% coverage,
`styles.xml` / `numbering.xml` / `theme1.xml` / `settings.xml` / `fontTable.xml` byte-identical,
US Letter preserved, and company, title and date each placed in their own run with no fallback.

**Three defects only the real file could surface are fixed.**

1. **Core Competencies as flat paragraphs.** The renderer tested for a table and passed anything
   else through, so flattening the template — which is what clears the `too_many_tables` finding —
   would have shipped the template's own skills on every application while the tailored ones were
   dropped, at a reported 100% coverage. It reads both shapes now.
2. **The heading check cried wolf five times.** Headings and entry lines are the same point size in
   this template, so all five jobs were reported as unrecognised headings. Entry lines are now told
   apart by a date range or an interior tab, and the heading size is the largest *recurring* one.
3. **`<w:tab>` inside `<w:pPr><w:tabs>` was extracted as a tab character.** It declares a tab stop;
   there is no text. Every positioned paragraph came out with a leading tab this app invented.

**`renderSummary` no longer takes the first non-empty paragraph.** It picks the longest preamble
paragraph that is neither a contact line nor too short to be prose. That rule only mattered once the
contact block could move into the body — where the old rule would have written the summary over the
name and deleted it, silently, because coverage checks that the input's text arrived and never that
the template's survived.

## Waiting on Joel

**Two edited copies of his template were handed to him on 2026-09-17, neither committed** — they
carry his name, employers and contact details, so they live in the chat and in Storage, never in
git. He picks one and uploads it; that closes ledger item 4.

- **A — competencies flattened.** What he asked for. Clears `too_many_tables`. Leaves
  `header_footer_content`.
- **B — A, plus the name and contact block moved out of the header into the body.** Audits
  completely clean. Visually identical in Word, because the header was first-page-only anyway.

**Also flagged to him, and his to fix in the template:** the Hobbies line reads "Golf, College
Football Reading" — a missing comma. It is a passthrough section, so it ships on every render.

## Traps specific to this app

- **Two template fixtures, and the wrong one hides bugs.** `template-sample.docx` keeps a second
  table and a `<w:sdt>` *on purpose* — `reformat-route.test.ts` pins that they survive into the
  output. `template-flat-sample.docx` is the current structure and audits clean. Reach for the flat
  one unless the test needs a defect to bite on.
- **`String.replace` interprets `$&` and `` $` `` even with a string pattern**, so splicing by index
  is the only safe way to swap a cell — in a tool whose headline section is dollar figures.
- **Content is not always a direct child of `<w:body>`.** Walk the tree. Named regression test.
- **The content check must not overstate or cry wolf**, and both are the same rule. It compares
  against what the renderer *took*, not the whole source.
- **Every new fixture is a place a real name can hide** — `.rels` hyperlink targets and `docProps/`,
  not just `document.xml`. The scrubber for the new fixture scans every byte of every part, and
  dropped 6.2 MB of embedded font binaries that were not ours to commit either.

## Next

1. **Run a real Jobright export through it.** The source side is still only exercised by a fixture.
   The template side no longer is.
2. **Remove the old renderer.** `lib/docx/build.ts` is dead in production; `lib/docx/spec.ts` only
   fills `templates.spec`, which is `not null`, so dropping it is destructive and splits into two
   pull requests. `tests/{spec,colour,roundtrip,highlights}.test.ts` go with it.
3. **Persist the change log.** Returned and shown, not stored; `renders.template_snapshot` carries
   it as a stopgap.
4. **One date-range regex, not two.** `lib/docx/label.ts` and `lib/reskin/sections.ts` each define
   one. The lint now imports the first; the second is still a second copy of the same fact.

**I am at a compaction point.** The branch is pushed and this file and `RULES.md` describe it.
