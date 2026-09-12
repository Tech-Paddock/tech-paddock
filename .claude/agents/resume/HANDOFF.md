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

## Your app is deployed and current again

**Fixed 2026-09-12.** `resume.techpaddock.io` serves `0c7d882`. The deploy outage that pinned every
app to `92c1ec1` for six and a half hours is over, and **#21, the PII scrub, went out with it** —
the company name is no longer in the live UI.

You can verify against the live site again. If deployments ever appear to stop, the cause both times
was Vercel-side rather than anything in this repo; the diagnosis is in
`.claude/agents/platform/HANDOFF.md` and the first thing to check is the project's `link.org`.

## Next steps

1. **Run real generated output through a free ATS checker.** Nobody has done this. Every other check
   in this app verifies that it does what it was designed to do; **none verifies that the design was
   right.** This is the highest-value open item in the app and it has been open since the rebuild.
2. **Link a render to a shared contact.** Still open from the rebuild.
3. **Decide whether `/api/health` should be reachable by an external monitor.** It currently sits
   behind the password gate — fine for human use, a blocker for uptime checks. This is a question
   for the TD and the Platform agent as much as for you.
