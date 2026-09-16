# Resume Formatter — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## In flight: one branch

`claude/resume-extract-spec-at-render` — `/api/reformat` re-extracts the spec from the stored
template `.docx` instead of trusting the `spec` column. Its worklog carries the detail and the
second-order questions.

**Merged and live:** the colour work is `#67`, squashed onto `main` as `76971bf` and deployed to
`tp-resume` production. The 2026-09-14 batch is `#56`.

## The app is rebuilt and live

Reformat (template + tailored resume → .docx), Templates (upload, version, activate), History (past
renders, redownload what was actually sent, log a submission) and an ATS check for any single file.
Renders persist to `resume.renders`, and naming a company writes the thread through to the Pipeline
Tracker.

The original build — structured content CRUD plus template CRUD plus docx generation — was the wrong
shape: it assumed the app authored resume content. It does not; Jobright does. The auth, password
and Supabase plumbing survived the rebuild; the content schema and its CRUD did not.

**120 tests pass** on `claude/resume-extract-spec-at-render`, 109 on `main`. Verified by running
them, not counted from a grep — `grep -c "it("` counts `describe` lines too and reads high.

## PII scrub: done (#21)

A real target company name had been sitting in a UI placeholder in `app/page.tsx` and in five
fixtures in `tests/persistence.test.ts` — and, more embarrassingly, in the handoff documents
describing the rule against it. All replaced with a synthetic substitute or removed.

**This is the app most likely to carry real data**, because its inputs are actual resumes. Every new
fixture is a place a real name can hide, and for a `.docx` that means checking `.rels` and
`docProps/` as well as `document.xml`.

## Your app is deployed and current again

**Fixed 2026-09-12.** `resume.techpaddock.io` serves `0c7d882`. The deploy outage that pinned every
app to `92c1ec1` for six and a half hours is over, and **#21, the PII scrub, went out with it** —
the company name is no longer in the live UI.

You can verify against the live site again. If deployments ever appear to stop, the cause both times
was Vercel-side rather than anything in this repo; the diagnosis is in
`.claude/agents/platform/HANDOFF.md` and the first thing to check is the project's `link.org`.

## Templates can now be downloaded, archived and deleted

Shipped 2026-09-14. `GET /api/templates/[id]/file` returns the original bytes — the template
doubles as the general-purpose resume, and until now there was no way to get it back out.
`PATCH {archived}` hides one without touching the renders built from it; `DELETE` removes row and
file but is **refused for any template a render points at**, and refused for the active one. That
ends append-only, which was Joel's call on 2026-09-14 — the reasoning never covered a duplicate
upload. **Ratified by the TD on 2026-09-15** — merging #56 was the ratification, since the amendment was
in it.

## Uploads are drop targets now

All four file inputs — both on Reformat, the template upload, the ATS check — use one control with
drag-and-drop, matching Coffee's bag scanner so the two tools do not ask for a file two different
ways. The pair on Reformat sit side by side at equal height. The pattern was copied into
`apps/resume`, not shared: if it should be common, that is TechPad Gen's call, not mine.

## Three renderer bugs, all found in Joel's real files

**Jobright ships Career Highlights as a markdown table.** A row of metrics, a `| :--- |` alignment
row, a row of descriptions — plain paragraphs, pipes and all, rendered verbatim into the output
table. Now transposed into pairs, but only when the cell counts line up; anything else falls
through and renders as written, because a guess costs keyword coverage. The alignment row is
counted on neither side of the coverage fraction, the same as a blank paragraph.

**Career Highlights rendered in the wrong shape.** The 2026-09 template draws it as one row of
columns, metric stacked above description. The builder emitted flat `metric: description` rows.
`spec.highlightsLayout` is now measured from the template's first table, so a template that changes
shape moves the output with it.

**A template with its name in the header rendered with no hierarchy at all.** Spec extraction ranks
body prose sizes; with the name in `header1.xml` every rank shifted and the name came out at body
size — and the heading came out *smaller* than body text. `extractSpec` now takes name and contact
sizes from the header and shifts the body ranks up by one. Verified end to end on the real files:
name 20pt, heading 11pt, body 11pt, one table, four cells, no pipe syntax, coverage 100%, and the
output now passes the ATS audit with **zero findings** where it previously raised a warning.

## The header trap, which cost an hour

Both templates Joel supplied carry his name, phone, email and LinkedIn in `word/header1.xml`. He
believed he had moved that block into the body. He had not — the newer template simply omits
`<w:titlePg/>`, and a `w:type="first"` header without it **is not displayed by Word**. It reads as
gone and is fully present in the archive.

The blocking `header_footer_content` finding is what reports this, and it was firing on part
*presence* rather than content — so it also fired on the empty `header1.xml` Word leaves behind
after you clear the text. It now reads the text. That is a narrower check, not a weaker one, and
both directions have a test.

**Joel intends to move the block into the body.** When he does, no code change is needed: the
header fallback is skipped when there are no header sizes to take.

## How a migration gets applied here — the CLI cannot do it, and never will

**`20260914221259_resume_template_archive.sql` is applied.** The technical director applied it at
the gate on 2026-09-15 and verified it from a fresh query rather than from the write: `archived_at`
exists, the check constraint exists, all three templates are intact, and the recorded version is
`20260914221259` — the file's own, so nothing drifted and no file needs renaming.

**The part worth carrying forward is the mechanism, because it is not obvious and it cost a
round.** `db push` cannot work in this repo and that is permanent, not a bug to fix: it refuses
whenever the remote holds a version the local directory lacks, and `20260908235234` is remote-only
for ever, on purpose, because it is seven real people's contact details and they are not coming into
this repo. So the CLI refuses every push, regardless of what else is or is not drifted.

**The answer is that the TD applies migrations through the hosted API at gate time**, recording the
file's own version in the same transaction. Write the file, open the pull request, and the
migration lands when the change does. Nothing for you to run, and nothing to route around.

Two things not to do when the CLI refuses, both of which look reasonable at 11pm:

- **Do not apply the SQL by hand without recording the version.** That is exactly how four coffee
  migrations came to exist twice, in the repo under invented round-minute timestamps and in the
  database under real ones. Recording it by hand instead is the forbidden repair subcommand wearing
  a different hat.
- **Do not rename another agent's migration files** to make the histories line up. Shared
  `supabase/` history is not `apps/resume`'s, and it would not have helped anyway — the withheld
  seed is enough on its own to make the CLI refuse.

`supabase/README.md` documented how to *inspect* the history and never how to *apply* to it.
**That gap is closed.** The README now says the technical director applies through the hosted API at
gate time, and `CLAUDE.md` carries the shape rule that makes applying-before-merging safe: a
migration must be one the currently-running code can ignore, because a merge deploys by itself in
about a minute and anything a human does afterwards happens while the app is already broken.
Additive changes ride with their code; destructive ones split into two pull requests.

## The template's colours and its entry line are read and rendered

Merged as #67 and live.

Every output used to be black. `headingColor` and `nameColor` had been in `TemplateSpec` since the
start and the builder already consumed both — `extractSpec` simply never assigned them. The
employer, title and dates had no colour support at all: one size, with bold and italic hardcoded
into `renderEntry`.

What is now true. `TemplateSpec` carries `defaultColor`, `contactColor` and two nested objects,
`entry` (company / title / dates) and `highlight` (metric / description), each a `RunStyle` of
size, colour, bold and italic. All of it is read out of the template and rendered.

Four things it needed, each of which is a trap worth knowing:

- **Runs, not just paragraphs.** The employer, title and dates are one paragraph and nothing but
  the runs tells them apart. `Para` gains `runs`, and `size`/`bold`/`italic` now come off the first
  of those rather than the first direct-child run — which also picks up a run Word has wrapped in a
  hyperlink.
- **Which cell a paragraph is in.** `Para.cell` numbers table, row and cell, so the highlights pair
  can be read from the first table: two paragraphs in one cell in a columns template, two cells of
  one row in a rows one.
- **An inherited value is a value.** The title states no size at all — its 10.5pt is `docDefaults`.
  `styleOf` resolves that at extraction time so the builder emits an explicit size and needs no
  notion of inheritance. The same read of `docDefaults` supplies `defaultColor`, which is the one
  line that stops bullets and prose rendering pure black.
- **A link's colour is the link's.** The contact line hyperlinks the email and the LinkedIn in the
  accent colour and sets the phone number grey. By length the accent wins, and the output renders
  that line as a single run — so it would put a phone number in link blue. `dominantColor` weighs
  the text that is *not* a link, by how much of the line it covers rather than by how many runs
  carry it, because Word splits runs mid-word for spellcheck and that split must not get a vote. A
  line that is nothing but links still has a colour, so links are the fallback rather than excluded.

Two corrections fell out of reading the trio. An entry line's first run is set at the **heading**
size, so "the first paragraph at the heading size" could land on an employer — it was a heading only
because one happens to come first in this document, and every heading would otherwise have taken the
grey of the title beside it. `isEntryLine` now keeps them out. And `entrySize`, the ranked guess,
read 10pt where the document says 11; it is brought into line with what the entry line measures.

**`extractSpec` starts from `normalizeSpec(null)`, never `{ ...DEFAULT_SPEC }`.** A spread shares
the nested objects, so `spec.entry.company = …` wrote into the defaults themselves, and in a
long-lived server process every later template inherited whatever the last one measured. There is a
test pinning this; do not swap it back for a spread.

**Deliberately not changed: `bodySize`.** The template's bullets inherit 10.5pt from `docDefaults`
and the renderer emits 10pt, because `bodySize` is the commonest explicitly-stated size and that
rule is deliberate. Half a point, nobody has raised it, and changing it reflows the whole document.

## The template file is what renders, not the `spec` column

On `claude/resume-extract-spec-at-render`, not yet on `main`. **This is the section to read before
touching anything about how formatting is resolved.**

`/api/reformat` used to render from `resume.templates.spec` — written once, at upload, by whichever
release was running then. So every change to what a spec can express did nothing until the template
was uploaded again by hand, with nothing anywhere saying so. Three times in one week the answer to
"why didn't that work" was a re-upload. Joel approved ending it on 2026-09-16.

**What is now true.** The route downloads the template's stored `.docx` and runs `extractSpec` on it.
The file is the template, so the file is what is read.

- **A render's formatting is derived from the file plus the code that reads it.** Two renders from the
  same template row at different times can legitimately differ. That is the point. `template_snapshot`
  is what keeps each one auditable — the schema comment has said "the spec as it was at render time"
  since the table was created, so this change is inside that design rather than against it.
- **The `spec` column is now a cache and a fallback, not the source of truth.** It is still written at
  upload and still shown on the Templates tab, which is why that line now reads "as uploaded" — a
  reader who took those four numbers for what will render would be wrong.
- **`extractSpec` runs on every saved render**, so a bug in it is now a render-time failure rather
  than an upload-time one. It must stay total: never throw on a `.docx` that reads.

**The fallback is deliberate and it is never silent.** If the download fails, or the stored bytes are
not a readable `.docx`, or the row somehow has no `file_path`, the render uses `normalizeSpec` on the
stored spec and succeeds — that spec is not a guess, it was extracted from those same bytes, and a
storage blip should not block a resume going out tonight. But an invisible fallback is exactly how
"the fix didn't work" happened three times, so the response carries `specSource` and a `specNote`
saying why, and the Reformat tab prints it. **If you ever make that fallback quiet, you have
reintroduced the bug this change exists to kill.**

Only `StorageError` and `DocxReadError` are caught. Anything else is a programming error and still
becomes the 500 it should be; there is a test pinning that, because laundering a `TypeError` into a
quietly degraded render is the obvious way to get this wrong.

**`normalizeSpec` still matters and is still the place a new spec field gets taught about.** It is
what the fallback goes through, and what keeps an old stored spec from throwing.

**A one-off template attached on Reformat is unchanged** — it always re-extracted, which is why it
was the way to test a template before committing it to a version.

**Joel approved this on 2026-09-15, in the conversation that merged #67, and again on 2026-09-16.**
The technical director recorded the first in this file, because no other agent can see that
conversation and the repo is the only channel. It is built on
`claude/resume-extract-spec-at-render`.

**What this does not remove, and the distinction is worth being exact about.** It ends re-uploading a
template to pick up a **code** change — a new spec field, a better reading of an old one. It does
nothing about a change to the **template itself**: if the active row points at an older `.docx`, the
render reflects that older design, because the file is now what is read. So #67's outstanding
re-upload still stands unless the active row already points at the current template file. Uploading a
template you have redesigned is not a workaround; it is just uploading the template.

## Next steps

The technical director's item 0 — build the re-extract fix — is **done**, on
`claude/resume-extract-spec-at-render`, and has left this list.

1. **Ask Joel whether the contact line should be grey or accent.** His template hyperlinks the email
   and the LinkedIn in the accent colour and sets the phone number grey; the output renders that line
   as one run and has to pick one, and it picks grey. Offered to him twice, 2026-09-15 and
   2026-09-16, and not taken up either time. One rule either way, so it stays as it is until he says
   otherwise — do not keep re-asking.
2. **Run real generated output through a free ATS checker.** Still the highest-value open item and
   still untouched: every check in this app verifies it does what it was designed to do, and none
   verifies the design was right. Note the constraint that turned up on 2026-09-14 — doing this
   with a real resume uploads Joel's personal data to a third party, which is his decision alone.
   A synthetic document exercises the structure without that.
3. **Link a render to a shared contact.** Still open from the rebuild.
4. **Decide whether `/api/health` should be reachable by an external monitor.** TD and Platform as
   much as you.
5. **Watch the version numbering now deletion exists.** `version` is unique and computed as
   max+1 across all rows including archived ones. Delete the newest template and the next upload
   reuses that number, so v3 can name two different files over time. Harmless today — renders keep
   a `template_snapshot` — but it is the kind of thing that reads as a bug later.
