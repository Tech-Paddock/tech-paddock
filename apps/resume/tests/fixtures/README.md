# Parse fixtures

Three real `.docx` files, **scrubbed of all personal information**, used by the parser and
spec-extraction tests.

| File | What it is |
|---|---|
| `jobright-sample.docx` | A Jobright export — the tool's content input |
| `template-sample.docx` | An older template, kept for **the defects it carries** |
| `template-flat-sample.docx` | The current template's structure — the realistic one |

**The two templates are not a duplicate, and picking the wrong one hides bugs.**

`template-sample.docx` has a second table and a `<w:sdt>` content control, and
`tests/reformat-route.test.ts` asserts both survive into the output. That is not a defect
waiting to be fixed — it pins the guarantee that nothing rewrites the template silently. Its
scrub also hoisted each paragraph's text into the first run and left the rest empty, so
**run-granular replacement cannot be exercised against it at all**; two bugs hid there and
both were found by accident.

`template-flat-sample.docx` is built from the template actually in use. It keeps one run per
field on the entry lines, real tab stops, Core Competencies as flat `Label:⇥items` paragraphs
rather than a table, and the name and contact block in the **body**. It audits clean, so it is
the fixture a new test should reach for unless it needs a defect to bite on.

Its embedded font binaries were removed — 6.2 MB of licensed font subsets that no test reads.

Every name, email, phone number, address, employer, school, and accomplishment has been
replaced with synthetic equivalents. Hyperlink targets in `.rels` and the author fields in
`docProps/` are scrubbed too. What is deliberately preserved is everything the parser
actually reads:

- Font sizes as the structural signal (Jobright: 25pt name, 11pt section headers, 10.5pt
  entry lines, 10pt body, 9pt contact line)
- List membership (`w:numPr`) and bullet glyphs
- Section headers, verbatim — they are generic and the parser matches on them
- Section rules drawn as images in the Jobright export
- The shape of every date string and its separators, and the company/title/date concatenation.
  **The dates themselves are not the export's**: every month-year was shifted by one fixed offset
  (TEC-31), because a real employment timeline is personal information even with the names gone.
  A fixed offset keeps every range in order and every gap the same length.
- `metric` / `description` split in Career Highlights
- The empty `styles.xml` in the Jobright export (no named styles at all)
- Content nested inside `<w:sdt>` content controls in the template

Regenerate by re-running the scrubber against a fresh export; never commit an unscrubbed file.
