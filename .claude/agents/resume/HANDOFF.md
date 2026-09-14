# Resume Formatter — handoff

State as of 2026-09-14.

Read `RULES.md` first. This file is only what is true right now.

---

## One branch in flight

`claude/resume-template-management-and-render-fixes` — the 2026-09-14 batch described below.
Everything else is merged. Start fresh, one branch per change.

## The app is rebuilt and live

Reformat (template + tailored resume → .docx), Templates (upload, version, activate), History (past
renders, redownload what was actually sent, log a submission) and an ATS check for any single file.
Renders persist to `resume.renders`, and naming a company writes the thread through to the Pipeline
Tracker.

The original build — structured content CRUD plus template CRUD plus docx generation — was the wrong
shape: it assumed the app authored resume content. It does not; Jobright does. The auth, password
and Supabase plumbing survived the rebuild; the content schema and its CRUD did not.

**60 tests pass.** Verified today.

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
upload. **The TD has not ratified the charter amendment.**

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

## Deploying this is blocked on the migration history, not on the code

**2026-09-14.** `20260914221259_resume_template_archive.sql` has never been applied. The CLI refuses
to push it: the remote holds five versions the local directory does not — the deliberately withheld
`20260908235234`, plus four coffee migrations that exist in the repo under different version stamps
than the ones actually applied. Full evidence is in this branch's worklog, raised for the TD.

**Do not work around it by applying the SQL by hand.** Doing that without recording the version is
how the coffee drift happened; recording it by hand is the forbidden repair subcommand wearing a
different hat. It needs the global decision, which is Platform's and the TD's.

Until then: PR #56 merges safely but must not reach a deployment. The app selects `archived_at`, so
live code without the column means `/api/templates` returns 500 and takes the Templates tab and
Reformat's active-template lookup with it.

## The stored spec is what renders, so a template must be re-uploaded after this ships

Worth knowing before anyone wonders why the fixes "did not work". `extractSpec` runs once, at
upload, and `/api/reformat` reads the stored `spec` column rather than re-extracting
(`app/api/reformat/route.ts:59`). So of the three renderer fixes, only the markdown-table parsing
takes effect on existing templates — it happens at reformat time. `highlightsLayout` and the
name/contact sizes live in the spec, so the active template has to be uploaded again to pick them
up. The one-off template slot on Reformat does re-extract fresh, which makes it the way to check a
template before committing it to a version.

## Next steps

1. **Run real generated output through a free ATS checker.** Still the highest-value open item and
   still untouched: every check in this app verifies it does what it was designed to do, and none
   verifies the design was right. Note the constraint that turned up on 2026-09-14 — doing this
   with a real resume uploads Joel's personal data to a third party, which is his decision alone.
   A synthetic document exercises the structure without that.
2. **Link a render to a shared contact.** Still open from the rebuild.
3. **Decide whether `/api/health` should be reachable by an external monitor.** TD and Platform as
   much as you.
4. **Watch the version numbering now deletion exists.** `version` is unique and computed as
   max+1 across all rows including archived ones. Delete the newest template and the next upload
   reuses that number, so v3 can name two different files over time. Harmless today — renders keep
   a `template_snapshot` — but it is the kind of thing that reads as a bug later.
