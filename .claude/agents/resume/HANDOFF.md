# Resume Formatter — handoff

State as of 2026-09-18.

Read `RULES.md` first. This file is only what is true right now.

---

## In flight

**`claude/resume-delete-any-resume`** — deletion, the third of five plan items. **It carries a
migration**, `20260918014500_resume_renders_outlive_templates.sql`: `renders.template_id` becomes
nullable with `on delete set null`, so a template can be deleted while its renders stand. **Shape:
additive** — every statement relaxes a constraint, so it is safe to apply before merging, and the
TD applies it at gate time. Renders gain a `DELETE` route; the templates route stops counting
renders at all.

## What is true now

**The engine is merged and live.** #101 landed it: the template's zip is opened, only the body of
`word/document.xml` is rewritten, and the same zip written back. Everything deciding how the
document looks is never read, so it cannot be read wrongly.

**Joel's template audits with no findings at all.** He moved the contact block out of
`word/header1.xml` and Core Competencies out of its table himself on 2026-09-17, and uploaded it —
ledger item 4 is done, pending the TD clearing the row. Renders against it carry 100% coverage,
every look-defining part byte-identical, US Letter kept.

## The agreed plan

Approved by Joel on 2026-09-17, ordering mine. **Structure first, styling last** — restyling before
the screens settle means styling them twice. Items 1 and 2 are the two branches above.

3. ~~Delete any resume type~~ — in flight above.
4. **One Resume tab, filtered by type** — Template / Input / Output. **Merge the view, not the
   tables** (his words). `templates` are files; `renders` are *events* holding an input file, an
   output file, coverage, a hash and a thread. One endpoint projects both into a typed list, no
   migration. The Templates tab is already only a list, so it folds in here.
5. **Layout: sleeker, built for a browser.** `lib/livery.ts` pins MP4/4 at build time and stays —
   layout and density only, no tokens, so TechPad Gen is not involved. The whole UI is one 800-line
   `app/page.tsx`, which is why it reads as a long scroll. **It must work at hub-iframe width too.**

**Open, and not mine alone:** `renders.thread_id` is a cross-schema FK into
`tracker.pipeline_threads`, and that tool is being deprecated. Whether this app keeps writing
threads there is a Joel/TD call.

## Traps specific to this app

- **A run-granular rewrite keeps the runs and drops what wrapped them.** `replaceInlineHeaderLine`
  and `replaceLabelledLine` rebuild a paragraph as `head + runs`, so a `<w:hyperlink>`,
  `<w:bookmarkStart>` or tracked change *on a rewritten line* is lost while its text survives.
  Measured; no effect on the current template, whose only hyperlinks are in the contact paragraph
  and pass through whole. Still silent, and a loss must be logged. Fix: splice runs in place, own PR.
- **Two template fixtures, and the wrong one hides bugs.** `template-sample.docx` keeps a second
  table and a `<w:sdt>` *on purpose* — `reformat-route.test.ts` pins that they survive.
  `template-flat-sample.docx` is the current structure and audits clean; reach for it by default.
- **`String.replace` interprets `$&` and `` $` `` even with a string pattern** — splice by index.
- **The rest are in `RULES.md`, deliberately not copied** — tree walking, the content check's two
  failure modes, where a real name hides in a fixture.

## Also outstanding

- **Run a real Jobright export through it.** The source side is still only fixture-tested.
- **Remove the old renderer.** `lib/docx/build.ts` is dead; `lib/docx/spec.ts` only fills
  `templates.spec`, which is `not null`, so dropping it is destructive and splits into two PRs.
- **Persist the change log.** Shown, not stored; `renders.template_snapshot` is a stopgap.
- **`lib/reskin/sections.ts` defines its own date range**; `lib/docx/headings.ts` owns the other.

**I am at a compaction point** once the branch above is pushed.
