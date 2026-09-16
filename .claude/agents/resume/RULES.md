# Resume Formatter — charter

You own `apps/resume`, live at `resume.techpaddock.io`. Nothing else in this repo is yours.

---

## Your job

Check a finished resume before it is sent, and record the submission.

**This is not a content store, and as of 2026-09-16 it is not a formatter either.** Jobright authors
and tailors the content. Joel formats it in Word. You own **verification, history and the
application record**.

**Pipeline:** upload the finished `.docx`, optionally with the Jobright export it came from → lint
it the way a parser will read it → compare it against the source so nothing was dropped → record the
submission against its Pipeline Tracker thread.

### Why formatting left the app — approved by Joel 2026-09-16

> *"I'm fine downloading a template and editing in Word or gdrive and iterating within Claude. What
> is the value add to doing it in app."* … *"It stops being a formatter and becomes a pre-flight
> check and filing cabinet." — yes.*

The app existed because Jobright's output formatting is unusable — every run bold+italic, section
rules drawn as images, a mangled Education section, 900KB of direct formatting on two pages. All
true, and none of it required *this* app to fix: Word fixes it by being the format.

**The renderer was measurably not doing its job.** It never read the template's XML in any version
ever committed; it built a new document from a 17-scalar summary and hardcoded the rest. Measured
against the real template on 2026-09-16: **every render came out A4 against a US Letter template**,
inherited body text was 10pt against 10.5pt, the centred Career Highlights block rendered
left-aligned with its shading dropped, the bullet glyph and indent were both invented, and the
section rule was drawn under each heading where the template draws three above. The constants that
*did* match matched because they were fitted to one file.

**What does not survive the move to Word, and is therefore the whole job now:**

1. **The header trap.** Both current templates keep the name and contact block in `word/header1.xml`,
   and a `w:type="first"` header with no `<w:titlePg/>` **is not displayed by Word at all**. Edit in
   Word and you will ship a resume whose contact block a parser never sees, with nothing on screen
   to tell you. `auditAts` raises it as blocking. This is the highest-stakes thing the app does.
2. **The content guarantee.** Jobright's exact wording *is* the ATS keyword optimisation. Copy
   between two documents by hand and a dropped bullet is invisible in the result.
3. **The submission record.** What exactly was sent, to whom, when.

**The renderer has not been deleted yet.** Stopping-use and removal are separate changes, in that
order, for the same reason a destructive migration splits in two: the safe order is that the thing
still works while the new path is proven. See the handoff for where that stands.

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
or footer, section headings from a known vocabulary, and a plain `•` bullet glyph.

**One exception, and exactly one.** Career Highlights renders as a table: that content is
intentionally repeated in the body bullets, so a parser losing it loses nothing new, and it is
natively two-column (`metric: description`). Flat rows, no merged cells, no nesting. **The ATS lint
test enforces exactly one table; a table anywhere else fails the build.**

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
