# Resume Formatter — charter

You own `apps/resume`, live at `resume.techpaddock.io`. Nothing else in this repo is yours.

`CLAUDE.md` binds you first and this charter adds to it. Where they appear to disagree, say so and
stop.

---

## Your job

Reformat a Jobright-tailored resume into Joel's own template, optimised for ATS readability, and
record the submission.

**This is not a content store.** Jobright authors and tailors the content. You own formatting,
history, and the application record. Both inputs are `.docx`, output is `.docx`, and there is no
copy-paste path.

**Why it exists:** Jobright does the tailoring and the ATS keyword work, but its output formatting
is unusable — every run bold+italic, section rules drawn as images, a mangled Education section, and
about 900KB of direct formatting on a two-page resume.

**Pipeline:** upload a Jobright `.docx` → extract paragraphs deterministically → label them → render
into the active template → review the coverage report → save, with the application details written
through to the Pipeline Tracker.

## What you own

Database: the `resume` schema.

### `templates`
id, version, name, `file_path` (original docx in Storage), `spec` (jsonb — extracted formatting),
is_active, created_at

Append-only; templates are never deleted. `is_active` auto-points at the newest upload, and pinning
an older one is deliberate — it raises a persistent banner on the render screen naming both
versions. **The template file is itself a deliverable**: it doubles as the general-purpose resume to
hand someone when there is no specific job, so the original bytes are kept, not just the spec.

### `renders`
id, template_id, template_snapshot, `source_file_path`, `parsed_content` (jsonb), `coverage`
(jsonb), `output_file_path`, content_hash, `thread_id` (FK → `tracker.pipeline_threads`, nullable),
`submitted_at` (nullable), created_at

**Storage:** the private `resume-files` bucket, under `templates/`, `sources/` and `renders/`. Files
are written **before** the row that points at them, so a row never references an object that was
never created.

---

## The two rules that define this tool

### Pure formatting. No model calls, ever.

Labelling is fully deterministic on both document families. **A model escalation was designed and
deliberately dropped**: it would have had nothing to decide, and it would have made output
non-deterministic — which is exactly what a saved render must not be.

The signal that would have triggered it is still worth having and still measured — coverage below
100%, or an `unknown_heading` finding — but it surfaces in the UI for a human rather than routing to
a model.

**Do not reintroduce a model call.** If a document defeats the rules, the coverage report names what
it could not place and you fix it by hand.

### Lossless: labelling moves text, it never rewrites it.

Every string comes from the source docx; labelling only assigns each paragraph a role. Content loss
is therefore **structurally impossible** rather than something verified after the fact. This matters
because Jobright's specific wording *is* the ATS optimisation — a silently dropped line is lost
keyword coverage.

**That rule was broken once and fixed.** A bullet appearing before the first employer line was
discarded while still being counted as placed, so the coverage report claimed 100% over text the
output did not contain. **The coverage claim is the whole point of the design; it must not be able
to lie.**

---

## Things that will catch you out

**Content is not always a direct child of `<w:body>`.** The template keeps Core Competencies inside
a `<w:sdt>` content control and Career Highlights inside a table cell. Walk the tree, never just the
body's direct children, or whole sections read as empty. There is a named regression test for this.

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

This app has the largest suite in the repo — 60 tests, `npm test`. CI runs
`npm run test --if-present`, so these tests are a large part of why CI means anything here.

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

**Never touch:** the shared auth plumbing (`lib/auth.ts`, `lib/password.ts`, `middleware.ts` —
byte-identical in five apps, fails silently on the other four); any app but `apps/resume`; any
schema but `resume`; `CLAUDE.md` or another agent's charter.

**Never do:**

- Reintroduce a model call. See above.
- Let the coverage report overstate what the output contains.
- Emit a second table, a text box, an image, or contact details in a header or footer.
- A schema change without its migration at `supabase/` in the repo root. Migrations were moved
  there from `apps/resume/` deliberately — one project, one history.
- **Commit personal information**, and for a `.docx` that means every part of the archive:
  hyperlink targets in `.rels`, author fields in `docProps/`, not just `document.xml`. The committed
  fixtures are scrubbed copies with synthetic substitutes. Keep them that way — a real company name
  has already had to be scrubbed from this app once.

## Guidelines

- Run `npm test` before every push. Sixty tests is not a burden here, it is the reason changes to a
  deterministic renderer are safe to make at all.
- When a document defeats the rules, improve the rules or report it honestly. Never widen an
  assertion to make a fixture pass.
- Prefer a named regression test over a comment. The `<w:sdt>` trap has one and it is why nobody has
  fallen into it twice.
