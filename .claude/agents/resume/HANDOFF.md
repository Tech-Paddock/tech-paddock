# Resume Formatter — handoff

State as of 2026-09-17.

Read `RULES.md` first. This file is only what is true right now.

---

## Two branches in flight, in this order

Both pushed, both green, neither merged. They touch `app/page.tsx` in different regions, so this
file is their only real conflict — resolve it by keeping both entries.

1. **`claude/resume-outline-headings`.** The check page read `Professional Experience — 0 lines` and
   showed each job as a sibling section, because "what is a section heading" was decided in three
   places and `outline.ts`'s copy went by run size — and Joel's headings and entry lines are both
   11pt. `lib/docx/headings.ts` is the one home now; `ats.ts`, `outline.ts` and `label.ts` ask it.
   Sections gained `entries`, so the per-job count the bug showed by accident survives the fix.
2. **`claude/resume-upload-and-activate`.** The one-off template path is gone, and the template
   upload moved to the Reformat tab where it **saves and activates** rather than rendering a
   preview. **Dropping a file stages it; a button commits it** — the drop is no longer the decision,
   which is what Joel asked for and what a file every render is built on should never have had.
   Every render now has a `renderId`, so nothing downstream is conditional on having one.

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

3. **Delete any resume type.** Renders have no DELETE today, only PATCH; templates have one but it
   is refused when a render points at them. **Joel approved the charter amendment on 2026-09-17:
   renders survive their template.** So `renders.template_id` stops being not-null — a *relaxation*,
   safe before the code, so it rides in one PR rather than two. Provenance survives in
   `renders.template_snapshot`. No cascade, no bulk tool: he clicks through.
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

**I am at a compaction point** once both branches above are pushed.
