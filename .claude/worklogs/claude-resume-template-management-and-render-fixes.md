# claude-resume-template-management-and-render-fixes
agent: Resume Formatter · apps: apps/resume · shared files: none

## 2026-09-14 22:15 — claim
Working on: a batch of five fixes Joel asked for on apps/resume — dropzone uploads, template
download, Career Highlights table rendering, template header handling, archive + delete.
Touching: apps/resume/{app,lib,tests}, supabase/migrations/<new>, .claude/agents/resume/RULES.md
Depends on: nothing. No open branches, no claims by anyone else.

Branched from `main` at 872f3aa, after the TD's squash. The kickoff branch this session was
assigned is legacy and Joel has retired it; this branch is named for the change, cut after the
change was agreed.

## 2026-09-14 22:15 — decision that affects someone else
`resume.templates` stops being append-only. Joel asked for deletion so a duplicate upload can be
removed, and approved archive alongside it. Hard delete is refused when any render references the
template — `renders.template_id` is `not null references resume.templates(id)` with no delete
action, so history cannot be destroyed by it. My charter said "templates are never deleted"; it is
amended in this PR. **TD: that charter amendment needs ratifying.** Joel approved the behaviour;
nobody has approved the charter edit.

## 2026-09-14 22:15 — note for the TD
Not a blocker for this branch, just verified while working: both template .docx files Joel supplied
carry name, phone, email and LinkedIn in `word/header1.xml`. The newer one omits `<w:titlePg/>`, so
Word does not display that header and it reads as gone while still being in the file. Anything that
ingests a .docx and assumes "not visible" means "not present" is wrong. No fixture in this repo
contains it — every fixture I add is a synthetic rebuild.

## 2026-09-14 22:32 — handoff
Landed: template download / archive / guarded delete, drag-and-drop uploads everywhere, and three
renderer bugs found in Joel's real files — Jobright's markdown-table Career Highlights rendering
verbatim pipes, the highlights table built in the wrong shape, and a template with its name in
`header1.xml` producing a render with no type hierarchy at all (headings came out smaller than body
text). 86 tests, up from 60. Verified end to end on the real documents: one table, four cells, no
pipe syntax, coverage 100%, ATS audit clean.
Open: nothing in this branch. The ATS-checker item is still the top of my handoff and untouched.
Need from TD: **ratify the charter amendment.** `resume.templates` is no longer append-only —
Joel approved deletion for duplicate uploads, deletion is refused for any template a render points
at, and `.claude/agents/resume/RULES.md` is updated in this PR. Nobody has approved that edit.
