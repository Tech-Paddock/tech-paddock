# Resume Formatter — handoff

State as of 2026-09-16.

Read `RULES.md` first — it was rewritten today and the change is the headline. This file is only
what is true right now.

---

## What is true now

**The app formats again, and this time it edits the template instead of rebuilding it.** Joel's own
earlier tool — `resume-reskin`, which ran locally on his desktop and never lived in this repo — did
it that way and got it right. Its engine is ported into `lib/reskin/`. He approved the port today;
his words are in `RULES.md`.

**This reverses the amendment made earlier the same day**, which had taken formatting out of the app
on the grounds that fixing it was expensive. That was wrong: working code already existed, so
porting beat both rebuilding and abandoning. The pre-flight check from #81 was not discarded — it
became the verification step that runs on every render.

**In flight:** branch `claude/resume-port-reskin-engine`, pushed, no pull request asked for.

## Why it works now, in one line

`lib/reskin/container.ts` opens the template's zip, rewrites only the body of `word/document.xml`,
and writes the same zip back. Everything that decides how the document looks is never read, so it
cannot be read wrongly. Measured against the fixture: page size, `styles.xml`, `numbering.xml`,
`theme1.xml`, alignment, shading, borders and underline all match the template exactly, where the
previous renderer got every one of them wrong.

## Where the old renderer stands

**`lib/docx/build.ts` is dead in production** — nothing outside tests imports it. `lib/docx/spec.ts`
is still imported by `app/api/templates/route.ts`, which writes a spec into `templates.spec` that
nothing now renders from.

Removing both is one change, and it is gated on a schema decision rather than on effort:
`templates.spec` is `not null`, so dropping it is destructive and splits into two pull requests.
`tests/{spec,colour,roundtrip,highlights}.test.ts` exercise the dead path and go with it.

## Traps specific to this app

- **`tests/fixtures/template-sample.docx` is scrubbed in a way that hides bugs.** The scrubber
  hoisted each paragraph's text into its first run and left the rest empty, so run-granular
  replacement can place only the company and the old `isEntryLine` matched nothing at all. Both were
  found by accident. Regenerate it so runs survive.
- **`String.replace` interprets `$&` and `` $` `` in the replacement even with a string pattern**, so
  splicing by index is the only safe way to swap a cell. A tool whose headline section is dollar
  figures cannot have a `$` hazard in its rewrite path.
- **Content is not always a direct child of `<w:body>`.** Walk the tree or whole sections read as
  empty. There is a named regression test.
- **The content check must not overstate or cry wolf**, and both are the same rule. It compares
  against what the renderer *took*, not the whole source — the name, contact and static sections are
  left behind deliberately, and counting them would flag the design as a defect every time.
- **Every new fixture is a place a real name can hide** — `.rels` and `docProps/`, not just
  `document.xml`. The original tool's own tests assert against real employers and a real address;
  none of that came across.

## Next

1. **Run a real resume through it.** Everything here is measured against a scrubbed fixture whose
   runs are degenerate. The real template exercises the run-granular path that the fixture cannot.
2. **Fix the template's two blocking ATS findings** — a second table and a `<w:sdt>` — in the
   template itself. Joel's, not code.
3. **Remove the old renderer**, per the schema note above.
4. **Regenerate `template-sample.docx`** so runs survive the scrub.
5. **Persist the change log.** It is returned and shown, not stored; `renders.template_snapshot`
   carries it today, which is a stopgap rather than a home.

**I am at a compaction point.** The branch is pushed and the charter and this file describe it; none
of it lives only in the session.
