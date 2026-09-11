# Parse fixtures

Two real `.docx` files, **scrubbed of all personal information**, used by the parser and
spec-extraction tests.

| File | What it is |
|---|---|
| `jobright-sample.docx` | A Jobright export — the tool's content input |
| `template-sample.docx` | The formatting template — the tool's style input |

Every name, email, phone number, address, employer, school, and accomplishment has been
replaced with synthetic equivalents. Hyperlink targets in `.rels` and the author fields in
`docProps/` are scrubbed too. What is deliberately preserved is everything the parser
actually reads:

- Font sizes as the structural signal (Jobright: 25pt name, 11pt section headers, 10.5pt
  entry lines, 10pt body, 9pt contact line)
- List membership (`w:numPr`) and bullet glyphs
- Section headers, verbatim — they are generic and the parser matches on them
- Section rules drawn as images in the Jobright export
- Date strings and their separators, and the company/title/date concatenation
- `metric` / `description` split in Career Highlights
- The empty `styles.xml` in the Jobright export (no named styles at all)
- Content nested inside `<w:sdt>` content controls in the template

Regenerate by re-running the scrubber against a fresh export; never commit an unscrubbed file.
