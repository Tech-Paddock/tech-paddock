# Agent: Resume

You own `apps/resume` — the Resume Formatter at `resume.techpaddock.io`. It reformats a
Jobright-tailored resume into Joel's own template, optimized for ATS readability, and records the
submission.

## Before you write anything

Read `CLAUDE.md`; the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh`. Open
your worklog at `.claude/worklogs/<your-branch>.md`.

**You have no branch in flight.** `claude/resume-formatter` is dead — three days cold, 52 commits
behind, conflicts on `CLAUDE.md` — and is being deleted. Start fresh, one branch per change.

This app is the only one with tests: 60 of them, `npm test` in `apps/resume`. CI runs
`npm run test --if-present`, so those tests are the reason CI means anything at all here.

## The two rules that define this tool

**Pure formatting. No model calls, ever.** Labelling is fully deterministic on both document
families. A model escalation was designed and deliberately dropped: it would have had nothing to
decide, and it would have made output non-deterministic — which is exactly what a saved render must
not be. The signal that would have triggered it is still measured (coverage below 100%, or an
`unknown_heading` finding) and now surfaces in the UI for a human. **Do not reintroduce a model
call.** If a document defeats the rules, the coverage report names what it could not place and you
fix it by hand.

**Lossless: labelling moves text, it never rewrites it.** Every string comes from the source docx;
labelling only assigns each paragraph a role. Content loss is structurally impossible rather than
something verified after the fact. This matters because Jobright's specific wording *is* the ATS
optimization — a silently dropped line is lost keyword coverage.

That rule was already broken once and fixed: a bullet appearing before the first employer line was
discarded while still counted as placed, so the coverage report claimed 100% over text the output
did not contain. **The coverage claim is the whole point of the design; it must not be able to lie.**

## Things that will catch you out

**Content is not always a direct child of `<w:body>`.** The template keeps Core Competencies inside
a `<w:sdt>` content control and Career Highlights inside a table cell. Walk the tree, never just the
body's direct children, or whole sections read as empty. There is a named regression test for this.

**Sizes are ranked, not hardcoded.** Jobright runs 25/11/10.5/10pt, the template 16/12.5/11/10pt,
and the template sets its Career Highlights metrics *larger than its own headings* — so ranking
ignores table and list text. Jobright's `styles.xml` defines no named styles whatsoever, which is
why run size is the only signal available.

**One table is permitted, and exactly one.** Career Highlights renders as a table because its
content is intentionally repeated in the body bullets — a parser losing it loses nothing new — and
it is natively two-column. Flat rows, no merged cells, no nesting. The ATS lint test enforces
exactly one; a table anywhere else fails the build.

**The rest of the ATS rules:** no text boxes, no images (Jobright draws section rules as images —
use real paragraph borders), contact details in the document body and never in a header or footer,
section headings from a known vocabulary, a plain `•` bullet glyph.

## Append-only, and why

Document artifacts never change once written — parsed content, coverage, the rendered file. A saved
render is a trustworthy record of *what was actually sent*, which is why the golden-file test
asserts byte-identical output across two renders.

`GET /api/renders/[id]/file` returns the **stored bytes**, never a re-render. Re-rendering would
answer a different question.

Application metadata stays editable, because a resume is usually rendered days before it goes out.
`submitted_at` stays null until it actually does.

Job details live on the linked tracker thread and are **never duplicated** here.

## Known work

**PII scrub — approved, not done.** A real target company name sat in a
UI placeholder at `apps/resume/app/page.tsx:389` and in five fixtures in
`tests/persistence.test.ts`. Replace it with a synthetic name. This is app code and tests, so run
the suite rather than just grepping.

**Still open from the rebuild:** linking a render to a shared contact, and a run through a free
ATS-checker against real generated output. Neither has been done.

## What you must not touch

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`. Byte-identical in
  four apps; a mismatch fails silently on the others.
- Schema changes without a migration file in the same PR. Migrations now live at `supabase/` in the
  repo root, **not** under `apps/resume` — they were moved there deliberately. Coordinate with the
  Supabase agent.
- `CLAUDE.md` — flag contradictions and stop.
- **Never commit personal information**, and for a `.docx` that means every part of the archive:
  hyperlink targets in `.rels`, author fields in `docProps/`, not just `document.xml`. The committed
  fixtures are scrubbed copies with synthetic substitutes. Keep them that way.

## Next steps

1. The PII scrub. Smallest, approved, unblocked.
2. Diagnose whether `/api/health` should be reachable by an external monitor — it currently sits
   behind the password gate, which is fine for human use and a blocker for uptime checks.
3. Link a render to a shared contact.
4. Run real generated output through a free ATS checker. Nobody has done this, and it is the only
   test of whether the whole tool achieves its purpose.
