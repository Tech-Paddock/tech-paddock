# Resume Formatter — handoff

State as of 2026-09-17.

Read `RULES.md` first. This file is only what is true right now; #101's body carries the reasoning.

---

## What is true now

**The engine is merged and live.** `tp-resume`'s production deployment opens the template's zip,
rewrites only the body of `word/document.xml`, and writes the same zip back out. #96 shipped it.

**The real template has been run through it, and it works.** Before 2026-09-17 everything was
measured against a fixture whose scrub had hoisted each paragraph's text into its first run — the one
shape that cannot exercise run-granular replacement. Against the real file: 100% coverage, every
look-defining part byte-identical, US Letter kept, company/title/date each in their own run.

**#101 is open and green** with four defects only the real file could surface:

1. **Core Competencies reads as flat paragraphs as well as a table.** The renderer tested for a
   table and passed anything else through, so flattening the template — which is what clears
   `too_many_tables` — would have dropped every tailored skill at a reported 100% coverage.
2. **The heading check cried wolf five times.** Headings and entry lines are the same point size
   here, so entry lines are told apart by a date range or an interior tab, and the heading size is
   the largest *recurring* one.
3. **`<w:tab>` inside `<w:pPr><w:tabs>` was extracted as a tab character.** It declares a stop and
   carries no text, so every positioned paragraph gained a leading tab this app invented.
4. **A run's trailing whitespace is the gap to the next field**, and overwriting the run dropped it:
   `Salesforce: ` rendered `Platform:Alpha Suite`, and `AdministratorJan 2026` where a `<w:tab/>`
   was all that separated title from dates.

**`renderSummary` no longer takes the first non-empty paragraph** — it picks the longest preamble
paragraph that is neither a contact line nor too short for prose. Once the contact block moves into
the body the old rule wrote the summary over the name and deleted it, silently, because coverage
checks that the input's text arrived and never that the template's survived.

## Waiting on Joel

**Joel did the template edits himself on 2026-09-17** — contact out of the header, Core Competencies
out of its table — and his version **audits clean, no findings**. A tidied copy went back to him to
upload; that closes ledger item 4. **No copy of his template is ever committed**: they carry his
name, employers and contact details, so they live in the chat and in Storage, never in git.

The tidy: Core Competencies and Hobbies carried `pStyle="ListParagraph"`, whose 720-twip indent
overrode the numbering's 480, so two of four bullet lists sat 1/6" right of the others while
`contextualSpacing` swallowed the gaps between rows. Dropping it aligns all four. 3 MB of embedded
Calibri, Georgia and Cambria went too — all ship with Word.

**Still his, flagged twice:** Hobbies reads "Golf, College Football Reading". Passthrough, so the
missing comma ships on every render.

## Traps specific to this app

- **A run-granular rewrite keeps the runs and drops what wrapped them.** `replaceInlineHeaderLine`
  and `replaceLabelledLine` rebuild the paragraph as `head + runs`, so a `<w:hyperlink>`,
  `<w:bookmarkStart>` or tracked change *on a rewritten line* is lost while its text survives.
  Measured, not feared, and no effect on either current template — their only hyperlinks sit in the
  contact paragraph, passed through whole. But it is silent, and the rule is that a loss is logged.
- **Two template fixtures, and the wrong one hides bugs.** `template-sample.docx` keeps a second
  table and a `<w:sdt>` *on purpose* — `reformat-route.test.ts` pins that they survive.
  `template-flat-sample.docx` is the current structure and audits clean; reach for it by default.
- **`String.replace` interprets `$&` and `` $` `` even with a string pattern** — splice by index.
- **The rest live in `RULES.md` and are deliberately not copied here** — walking the tree for
  content, the content check's two failure modes, and where a real name hides in a new fixture.

## Next

1. **Run a real Jobright export through it.** The source side is still only fixture-tested.
2. **Splice runs in place rather than concatenating them**, so a rewritten line keeps its hyperlinks
   and bookmarks — the trap above. Touches the engine's most load-bearing function, so it is its own
   change with its own tests, never a rider on something else.
3. **Remove the old renderer.** `lib/docx/build.ts` is dead in production; `lib/docx/spec.ts` only
   fills `templates.spec`, which is `not null`, so dropping it is destructive and splits into two
   pull requests. `tests/{spec,colour,roundtrip,highlights}.test.ts` go with it.
4. **Persist the change log.** Shown, not stored; `renders.template_snapshot` is a stopgap.
5. **One date-range regex, not two.** `lib/docx/label.ts` and `lib/reskin/sections.ts` each define
   one. The lint imports the first; the second is still a second copy of the same fact.

**I am at a compaction point.** The branch is pushed and this file and `RULES.md` describe it.
