# Resume Formatter — handoff

State as of 2026-09-19.

Read `RULES.md` first. This file is only what is true right now.

---

## In flight

**Nothing.** #135 merged as `c3c40fd`, its branch is gone, and the tab work and verdict below are
live rather than pending — verified at `main`, not assumed.

## What is true now

**The screen is three tabs: Reformat · Resume · Diagnostics, and Reformat is the landing tab.**
**Reformat carries no readouts** — Joel, 2026-09-19: *"I don't want any telemetry on the main tab."*
It is the act: pick, drop, reformat, download, log where it went. Every measurement is on
Diagnostics, which **reads from two sources**: the render just made, shown without asking for a
file, and any document dropped in. `?tab=check` still resolves. **Reformat's one judgement is a
pass/fail verdict** (`lib/verdict.ts`, ten tests): it fails on what happened to *this* reformat —
lost lines, a blocking finding, input the template had no room for, an unfilled section — never on
a template warning, which would pin it to FAIL until the template changed and is a note instead.
Templates and History were one thing split by which table it lived in, which is the app's business
and not the reader's; they are one tab with a Template / Input / Output filter over `/api/resumes`.
**The view is merged; the tables are not.** A render contributes two rows sharing its id, so deleting
either deletes the event and both files, and the confirm says so.

**The layout is a workbench**: a rail of inputs, a column of results, one column below `lg` — the
hub's iframe width, so narrow is the normal case. MP4/4 is pinned and no theme token has changed.

**Deleting used to leave the row on screen, and that was the client, not the API** — the old code
refreshed only on success, so a response erroring *after* the row was gone left it listed. Now every
write goes through one `mutate` that reloads in a `finally`, a 404 counts as success, and a failed
reload labels the list unverified rather than authoritative.

**The engine is merged and live** (#101): only the body of `word/document.xml` is rewritten and the
same zip written back, so nothing deciding how it looks is ever read. **Joel's template audits clean.**

**Newer than the charter:** `/api/resumes`, `/api/renders/[id]/source` (the uploaded document,
stored since renders began and unreachable until #112), `lib/serveDocx.ts` and `lib/verdict.ts`.

**Deleting works completely — measured 2026-09-19 against the live database**, not the screen:
nothing orphaned in either table or storage. What read as a bug is #107 as asked: renders outlive
their template.

**Agreed in principle and not built:** the filename becomes `LastName_FirstName_CreationDate`, the
name lifted from the template's own contact line, and `company`/`title` become columns on `renders`.
**Both wait on Joel** — the columns need his approval, since `RULES.md` forbids storing the job here.
He is taking the plugin's surface and auth questions to the technical director.

## Traps specific to this app

- **A list is a projection of the server, never a memory of it.** The comment on `reload` in
  `app/page.tsx` carries the measurement. Still not in `.claude/DECISIONS.md`.
- **A run-granular rewrite keeps the runs and drops what wrapped them.** `replaceInlineHeaderLine`
  and `replaceLabelledLine` rebuild a paragraph as `head + runs`, so a `<w:hyperlink>` on a rewritten
  line is lost while its text survives. Harmless on the current template, still silent; own PR.
- **Two template fixtures, and the wrong one hides bugs.** `template-sample.docx` keeps a second
  table and a `<w:sdt>` on purpose; `reformat-route.test.ts` pins that they survive.
  `template-flat-sample.docx` is the current structure — reach for it by default.
- **`String.replace` interprets `$&` even with a string pattern** — splice by index. Other traps, including tree walking and the content check's two failure modes, are in `RULES.md`.

## Also outstanding

- **Run a real Jobright export through it.** The source side is still only fixture-tested.
- **Remove the old renderer.** `lib/docx/build.ts` is dead; `lib/docx/spec.ts` only fills
  `templates.spec`, which is `not null`, so dropping it is destructive and splits into two PRs.
- **Persist the change log** — shown, not stored, so Diagnostics and the verdict are blank after a
  reload, though `renders.coverage` survives.
- **`lib/reskin/sections.ts` defines its own date range**; `lib/docx/headings.ts` owns the other.
- **Not mine alone:** `renders.thread_id` points into the tracker's schema, and that tool is being
  deprecated — most of the argument for the `company`/`title` columns.

**`RULES.md` is wrong in one place now.** Line 306 still forbids deleting a template a render
points at, which #107 removed on Joel's amendment, while the same file explains that removal sixty
lines above — the charter contradicts itself. **A charter edit is Joel's approval**, so it is raised
with the technical director, not made here. #136 fixed the migration half and `drift` is clean on it.

**I am at a compaction point.**
