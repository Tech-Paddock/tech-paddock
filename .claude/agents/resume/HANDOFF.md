# Resume Formatter — handoff

State as of 2026-09-17.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**The engine is merged and live.** `tp-resume`'s production deployment opens the template's zip,
rewrites only the body of `word/document.xml`, and writes the same zip back out. #96 shipped it.

**The real template has been run through it, and it works.** Everything before 2026-09-17 was
measured against a fixture whose scrub had hoisted each paragraph's text into its first run — the
one shape that cannot exercise run-granular replacement. Against the real file: 100% coverage, every
part that defines the look byte-identical, US Letter kept, and company, title and date each placed
in their own run with no fallback.

**Four defects only the real file could surface are fixed.**

1. **Core Competencies as flat paragraphs.** The renderer tested for a table and passed anything
   else through, so flattening the template — which is what clears `too_many_tables` — would have
   shipped the template's own skills on every application while the tailored ones were dropped, at
   a reported 100% coverage. It reads both shapes now.
2. **The heading check cried wolf five times.** Headings and entry lines are the same point size
   here, so all five jobs were reported as unrecognised headings. Entry lines are now told apart by
   a date range or an interior tab, and the heading size is the largest *recurring* one.
3. **`<w:tab>` inside `<w:pPr><w:tabs>` was extracted as a tab character.** It declares a tab stop
   and carries no text. Every positioned paragraph came out with a leading tab this app invented.
4. **A run's trailing whitespace is the gap to the next field, and it is the template's.**
   Overwriting the run drops it: `Salesforce: ` renders `Platform:Alpha Suite`. Worse, where a
   `<w:tab/>` is all that sits between a job title and its dates, **no character separates them**,
   so an extractor that concatenates `<w:t>` without handling tabs reads `AdministratorJan 2026`.

**`renderSummary` no longer takes the first non-empty paragraph.** It picks the longest preamble
paragraph that is neither a contact line nor too short for prose. Once the contact block moves into
the body the old rule wrote the summary over the name and deleted it — silently, because coverage
checks that the input's text arrived, never that the template's survived.

## Waiting on Joel

**Joel did the template edits himself on 2026-09-17** — contact out of the header, Core Competencies
out of its table — and his version **audits clean, no findings**. A tidied copy went back to him and
is his to upload; that closes ledger item 4. **No copy of his template is ever committed**: they
carry his name, employers and contact details, so they live in the chat and in Storage, never in git.

The tidy: Core Competencies and Hobbies carried `pStyle="ListParagraph"`, whose 720-twip indent
overrode the numbering's 480, so two of four bullet lists sat 1/6" right of the others and
`contextualSpacing` swallowed the gaps between competency rows. Dropping the style aligns all four.
3 MB of embedded Calibri, Georgia and Cambria went too — all three ship with Word.

**Still his, flagged twice:** Hobbies reads "Golf, College Football Reading". Passthrough, so the
missing comma ships on every render.

## Traps specific to this app

- **Two template fixtures, and the wrong one hides bugs.** `template-sample.docx` keeps a second
  table and a `<w:sdt>` *on purpose* — `reformat-route.test.ts` pins that they survive into the
  output. `template-flat-sample.docx` is the current structure and audits clean. Reach for the flat
  one unless the test needs a defect to bite on.
- **`String.replace` interprets `$&` and `` $` `` even with a string pattern** — splice by index.
- **Content is not always a direct child of `<w:body>`.** Walk the tree. Named regression test.
- **The content check must not overstate or cry wolf**, and both are the same rule: it compares
  against what the renderer *took*, not the whole source.
- **Every new fixture is a place a real name can hide** — `.rels` hyperlink targets and `docProps/`,
  not just `document.xml`. The scrubber scans every byte of every part.

## Next

1. **Run a real Jobright export through it.** The source side is still only fixture-tested.
2. **Remove the old renderer.** `lib/docx/build.ts` is dead in production; `lib/docx/spec.ts` only
   fills `templates.spec`, which is `not null`, so dropping it is destructive and splits into two
   pull requests. `tests/{spec,colour,roundtrip,highlights}.test.ts` go with it.
3. **Persist the change log.** Returned and shown, not stored; `renders.template_snapshot` carries
   it as a stopgap.
4. **One date-range regex, not two.** `lib/docx/label.ts` and `lib/reskin/sections.ts` each define
   one. The lint imports the first; the second is still a second copy of the same fact.

**I am at a compaction point.** The branch is pushed and this file and `RULES.md` describe it.
