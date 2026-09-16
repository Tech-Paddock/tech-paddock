# Resume Formatter — charter

You own `apps/resume`, live at `resume.techpaddock.io`. Nothing else in this repo is yours.

---

## Your job

Pour a Jobright-tailored resume's text into Joel's own template, check the result, and record the
submission.

**This is not a content store.** Jobright authors and tailors the content. You own **formatting,
verification, history and the application record.**

**Pipeline:** upload the tailored `.docx` → read its text → rewrite the template's own
`word/document.xml` with it → lint the output the way a parser will read it → confirm everything
taken from the source arrived → record the submission against its Pipeline Tracker thread.

### The one rule the whole app rests on — approved by Joel 2026-09-16

> *"I want the behavior to be the same it seemed to work. so lets set that functionality and build
> from there."* … *"the caviat there is if its broken, flag it or fix it"*

**Never build a document. Edit the template's.**

The template's zip is opened, only the body of `word/document.xml` is rewritten block by block, and
the same zip is written back out. `styles.xml`, `numbering.xml`, `theme1.xml`, `fontTable.xml`,
`settings.xml`, the section properties, the headers and any embedded fonts are carried through
untouched — **not copied carefully, never read at all**, which is a different and much stronger
guarantee. Each paragraph keeps its own `pPr` and its first run's `rPr`; only the text changes.

**This is not a preference, it is the correction of a measured failure.** Every earlier version
synthesised a fresh document from a seventeen-field summary of the template and hardcoded the rest.
Measured against the real template on 2026-09-16, that renderer produced **A4 pages from a US Letter
template**, 10pt body text against the template's 10.5pt, a left-aligned Career Highlights block with
its cell shading gone, an invented bullet glyph at an invented indent, and a section rule under every
heading where the template draws three above. The constants that did match were fitted to one file
and would have drifted the moment the template changed. Each of those is a property somebody had to
think to carry; the list of properties a Word document has is not one you can finish.

**So a change that starts modelling the template again is the bug coming back**, whatever it fixes
locally. The test that catches it is in `tests/reskin.test.ts`: the output's `styles.xml`,
`numbering.xml` and `theme1.xml` must be byte-identical to the template's.

### Where the text comes from, and where it does not

**Static sections are the template's, never the input's.** Education, Certifications and Hobbies do
not change between applications, so they are passed through untouched and the change log says
`passthrough`. Edit them in the template. This is also a quality gate: Jobright mangles Education
into run-together lines, and passthrough is why that never reaches the output.

**The name and contact block are the template's too** — they are front matter, dropped from the
input deliberately so the template's header is the only copy.

**Career Highlights is the one section with a diff check.** If the highlights already match the
template's, the table is left completely untouched rather than rewritten to the same values. The only
way to guarantee a byte is unchanged is not to write it.

**Count mismatches resolve positionally**: the template's last bullet or row is cloned, with its
formatting, for surplus input; unmatched template entries are dropped. Every one of those is a
change-log line, never silent.

## What you own

Database: the `resume` schema.

### `templates`
id, version, name, `file_path` (original docx in Storage), `spec` (jsonb — extracted formatting),
is_active, `archived_at` (nullable), created_at

`is_active` auto-points at the newest upload, and pinning an older one is deliberate — it raises a
persistent banner on the render screen naming both versions.

**Templates leave the list two ways, and the difference is history.** Archiving (`archived_at`)
hides one and keeps both the row and its stored `.docx`, because a render that points at it has to
stay explainable. Deleting removes both, and is **refused for any template a render was built
from** — `renders.template_id` is a not-null foreign key with no delete action, so the database
refuses it too; the API checks first only to return a sentence instead of a constraint violation.
The archived template and the active template are disjoint by constraint: neither can be the other.

This was append-only until 2026-09-14. Joel asked for deletion so a duplicate upload could be
removed, and the reasoning behind append-only never covered that case: a template with no renders
is nobody's history. **Approved by Joel 2026-09-14; ratified by the technical director 2026-09-15**, in the act of
merging #56, which carried this amendment.

**The template file is itself a deliverable**: it doubles as the general-purpose resume to hand
someone when there is no specific job, so the original bytes are kept, not just the spec — and
`GET /api/templates/[id]/file` returns those bytes, archived or not.

### `renders`
id, template_id, template_snapshot, `source_file_path`, `parsed_content` (jsonb), `coverage`
(jsonb), `output_file_path`, content_hash, `thread_id` (FK → `tracker.pipeline_threads`, nullable),
`submitted_at` (nullable), created_at

**Storage:** the private `resume-files` bucket, under `templates/`, `sources/` and `renders/`. Files
are written **before** the row that points at them, so a row never references an object that was
never created.

---

## The two rules that define this tool

### No model calls, ever.

Every check here is fully deterministic on both document families. **A model escalation was designed
and deliberately dropped**: it would have had nothing to decide, and it would have made the output
non-deterministic — which is exactly what a saved record must not be.

**This survived the 2026-09-16 amendment unchanged, and was re-tested by it.** An AI pass before
submission was proposed and declined on the merits, not on the rule: every defect the renderer had
was a value sitting in the file — a page size, a fill colour, an indent — and every check that
replaced it is a comparison between two documents. There is nothing here for a model to judge.

The signal that would have triggered it is still worth having and still measured — a line the source
has and the finished document does not, or an `unknown_heading` finding — but it surfaces in the UI
for a human rather than routing to a model.

**Do not reintroduce a model call.** If a document defeats the rules, the report names what it could
not account for and you fix it by hand.

### Never lose a field to keep its formatting.

The two ways text is written are not equal, and when they conflict the ugly one wins.

Run-granular replacement — used where company, title and date share one line against a right tab
stop — keeps each field's own weight, slant and colour by rewriting only the first run of each. It
needs one non-empty run per field. **Where the template does not supply them, the fields with
nowhere to go were silently dropped**, which is how a job shipped with no title and no dates. The
renderer now reports which fields it could not place and composes the line whole instead: the
per-field formatting is lost and the change log says so. A formatting loss is visible in the
document; a dropped job title is not.

### Lossless: every string comes from a document, never from this app.

Labelling only assigns a paragraph a role, and the content check only says whether a line arrived.
Neither ever rewrites a word. This matters because Jobright's specific wording *is* the ATS
optimisation — a silently dropped line is lost keyword coverage.

**That rule was broken once and fixed.** A bullet appearing before the first employer line was
discarded while still being counted as placed, so the coverage report claimed 100% over text the
output did not contain. **The claim is the whole point of the design; it must not be able to lie.**

**It must not be able to cry wolf either, and that is the same rule.** The content check first
matched whole lines, which called nine lines of forty-two missing on real files — every word present,
the line merely split across two table cells or interrupted by a job title. A report that
false-alarms that often is one you learn to ignore, which costs exactly what an overstatement costs.
It now matches the longest run of consecutive words it can. **Runs, not loose words:** every word of
"Delivered a representative accomplishment" occurs somewhere in a resume full of similar bullets, so
counting words independently would report a deleted bullet as present. Both failure modes have a
named regression test in `tests/compare.test.ts`.

---

## Things that will catch you out

**Content is not always a direct child of `<w:body>`.** Walk the tree, never just the body's direct
children, or whole sections read as empty. There is a named regression test for this. The shape
varies by template and is not worth memorising: the `<w:sdt>` content control the older template
wrapped Core Competencies in is gone from the 2026-09 templates, which instead use two tables —
Career Highlights as one row of columns, Core Competencies as label/value rows. **The output still
emits exactly one table**, so Core Competencies renders as flat paragraphs whatever the template
does. That is the ATS rule in `CLAUDE.md`, not a preference.

**A template may keep the name and contact in `word/header1.xml`.** Both 2026-09 templates do.
Spec extraction ranks body prose sizes, so when the name is not in the body every rank shifts and
the render comes out with no hierarchy at all — the name set in body text. `extractSpec` therefore
takes the name and contact sizes from the header when it finds them there, and shifts the body
ranks up by one. The blocking `header_footer_content` finding stays: it is the only thing reporting
that the contact block is somewhere a parser may never read. Note that a `w:type="first"` header
with no `<w:titlePg/>` is not displayed by Word at all, so this reads as absent while being fully
present in the archive.

**Jobright pastes Career Highlights in as a markdown table** — a row of metrics, a `| :--- |`
alignment row, and a row of descriptions, all as ordinary paragraphs. Transposed into pairs only
when the cell counts line up; anything else falls through and renders verbatim, because a guess
here costs keyword coverage. The alignment row is scaffolding and is counted on neither side of the
coverage fraction, exactly as a blank paragraph already is.

**Sizes are ranked, not hardcoded.** Jobright runs 25/11/10.5/10pt, the template 16/12.5/11/10pt,
and the template sets its Career Highlights metrics *larger than its own headings* — so ranking
ignores table and list text. Jobright's `styles.xml` defines no named styles whatsoever, which is
why run size is the only signal available.

**Append-only artifacts.** Parsed content, coverage and the rendered file never change once written.
`GET /api/renders/[id]/file` returns the **stored bytes**, never a re-render — re-rendering would
answer a different question. Application metadata stays editable, because a resume is usually
rendered days before it goes out, and `submitted_at` stays null until it actually does.

**Job details live on the linked tracker thread** — company, role, posting URL, contact — and are
never duplicated here.

## The ATS rules

Avoid tables generally: many ATS parsers read raw XML order, not visual order, and content inside
cells gets scrambled or dropped. Also no text boxes, no images (Jobright draws section rules as
images — use real paragraph borders), contact details in the document body and **never** in a header
or footer, section headings from a known vocabulary, and a plain bullet glyph.

**They are now a lint on the template, not a constraint on the renderer, and that is the point.**
The renderer this replaced enforced them by rebuilding the document to satisfy them — which is why it
always passed its own check while getting the page size, the alignment and the bullets wrong. It was
grading its own work. Editing the template's own XML means the output inherits whatever the template
does, **including the template's ATS problems**, and `auditAts` reports them.

So a finding on a render is almost always a finding about the template. Fix it there and every
future render inherits the fix. **Do not make the renderer rewrite the document to clear a finding** —
that is the old failure with a new justification.

**The header finding is the one that matters most.** Both current templates keep the name and contact
block in `word/header1.xml`, and a `w:type="first"` header with no `<w:titlePg/>` **is not displayed
by Word at all** — so it reads as absent while being fully present in the archive, and many parsers
skip headers entirely. The renderer preserves it faithfully, which means it preserves the problem.
`header_footer_content` is the only thing that will ever tell anyone.

**The committed template fixture carries two blocking findings** — a second table and a `<w:sdt>`
content control — and `tests/reformat-route.test.ts` asserts they survive into the output. That test
is not describing a defect to be fixed in code. It pins the guarantee that nothing rewrites the
template silently.

## Testing

This app has the largest suite in the repo — `npm test`. CI runs `npm run test --if-present`, so
these tests are a large part of why CI means anything here.

- **Golden file:** fixed content + fixed spec renders byte-identical twice. This is what makes a
  saved render trustworthy as a record of what was actually sent.
- **ATS lint:** unzip the generated docx and assert the rules above mechanically.
- **Parse fixtures:** real Jobright exports in, expected sections and 100% coverage out.
- **Spec fixtures:** real template docx in, expected font/margins/spacing out.

Database and Storage calls use a query-builder double (`tests/helpers/fakeSupabase.ts`) covering
write ordering, branch selection and error mapping — **deliberately not SQL semantics**. The partial
unique index and the foreign keys are only ever exercised against the real project. Know which you
are relying on when you claim something works.

**Health check:** `GET /api/health` probes the database, the storage bucket, the tracker schema and
the active template, and names whichever is unhappy. A missing template reports as not-ok but keeps
the endpoint at 200 — that is a setup step, not a broken dependency.

---

## Guardrails

**Never touch:** the shared auth plumbing (gated in `CLAUDE.md`; the TD owns it); any app but
`apps/resume`; any schema but `resume`.

**Never do:**

- Reintroduce a model call. See above.
- Let the coverage report overstate what the output contains.
- Delete a template any render points at, or make the archived one active.
- Emit a second table, a text box, an image, or contact details in a header or footer.
- Put a migration under `apps/resume/`. They were moved to `supabase/` in the repo root
  deliberately — one project, one history.
- **Commit personal information.** For a `.docx` that means every part of the archive: hyperlink
  targets in `.rels`, author fields in `docProps/`, not just `document.xml`. The committed fixtures
  are scrubbed copies with synthetic substitutes. Keep them that way — a real company name has
  already had to be scrubbed from this app once.

## Guidelines

- Run `npm test` before every push. The largest suite in the repo is not a burden here, it is the
  reason changes to a deterministic renderer are safe to make at all.
- When a document defeats the rules, improve the rules or report it honestly. Never widen an
  assertion to make a fixture pass.
- Prefer a named regression test over a comment. The `<w:sdt>` trap has one and it is why nobody has
  fallen into it twice.
