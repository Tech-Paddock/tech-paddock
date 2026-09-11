# Resume Formatter — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## No branch in flight

`claude/resume-formatter` held the pre-monorepo scaffold and has been deleted.
`claude/resume-editor-design-wccfly` is fully merged — 0 ahead of `main`, 19 behind — and is on the
list to delete in the GitHub UI.

Start fresh, one branch per change.

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

## Your app is live but stale

`resume.techpaddock.io` is serving code from **17:48 today**, commit `92c1ec1`. Eleven merges to
`main` since then have not deployed — **including #21, the PII scrub.** The real company name is
still being served in the live UI, behind the password gate.

Not your bug and not yours to fix: Vercel's GitHub App lost its installation when the repo was
transferred. It is on Joel's list and the Platform agent's. But it does mean the live site is not
running your code, so nothing can be verified there, and the one user-visible consequence of the
outage is yours.

## Next steps

1. **Run real generated output through a free ATS checker.** Nobody has done this. Every other check
   in this app verifies that it does what it was designed to do; **none verifies that the design was
   right.** This is the highest-value open item in the app and it has been open since the rebuild.
2. **Link a render to a shared contact.** Still open from the rebuild.
3. **Decide whether `/api/health` should be reachable by an external monitor.** It currently sits
   behind the password gate — fine for human use, a blocker for uptime checks. This is a question
   for the TD and the Platform agent as much as for you.
