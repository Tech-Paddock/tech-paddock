# Resume Formatter — handoff

State as of 2026-09-18.

Read `RULES.md` first. This file is only what is true right now.

---

## In flight

**`claude/resume-one-resume-tab-and-layout`** — the last two items of the agreed plan, built together
because they rewrite the same screen. No migration. Nothing to do at deploy time.

## What is true now

**The screen is three tabs: Reformat · Resume · Check, and Reformat is the landing tab.** Templates
and History were two lists of the same thing split by which table it lived in, which is the app's
business and not the reader's. They are one tab with a type filter — Template / Input / Output —
over one endpoint, `/api/resumes`, which projects both tables. **The view is merged; the tables are
not.** A render contributes two rows sharing the render's id, so deleting either deletes the event
and both its files, and the confirm says so.

**The layout is a workbench**: a left rail of inputs, a right column of results, collapsing to one
column below `lg` — which is also the hub's iframe width, so that is the narrow case rather than an
edge case. The header is the shared bar with the tabs on it. `lib/livery.ts` still pins MP4/4 and no
theme token changed, so TechPad Gen is not involved.

**Deleting used to leave the row on screen, and that was the client, not the API.** Measured on
2026-09-18: nine files listed, one row in `resume.templates`. Every delete had worked; each one
errored *after* the row was gone, and the old code only refreshed on success, so the list drifted
further from the database with every click and the next click on a dead row returned "No template
with that id." Now every write goes through one `mutate` that reloads in a `finally`, a 404 is
treated as success — the thing is already gone, which is what the click asked for — and a failed
reload labels the list as unverified instead of leaving it looking authoritative.

**The engine is merged and live** (#101): only the body of `word/document.xml` is rewritten and the
same zip written back, so everything deciding how the document looks is never read and cannot be
read wrongly. **Joel's template audits with no findings at all.**

**New since #107:** `/api/resumes` (the merged list), `/api/renders/[id]/source` — the uploaded
document has been stored since renders were first persisted and until now there was no way to get it
back out — and `lib/serveDocx.ts`, which is the one home for serving stored bytes now that three
routes do it.

**The agreed plan is complete.** All five items Joel listed on 2026-09-17 are built.

## Traps specific to this app

- **A list is a projection of the server, never a memory of it.** See above; the code comment on
  `reload` in `app/page.tsx` carries the measurement. This belongs in `.claude/DECISIONS.md` and is
  not there — that file is at 193 of its 200 lines, so it needs a trim before it takes another entry.
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
- **`/api/renders` has no reader left** now the UI reads `/api/resumes`; it stays as the collection
  endpoint its `PATCH`/`DELETE` siblings hang off.

**Open, and not mine alone:** `renders.thread_id` is a cross-schema FK into
`tracker.pipeline_threads`, and that tool is being deprecated. Whether this app keeps writing
threads there is a Joel/TD call.

**I am at a compaction point** once the branch above is pushed.
