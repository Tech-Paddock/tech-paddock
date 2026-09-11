## What changed

## Why

## Blast radius
<!-- Which apps does this touch? Which shared files? "One app, no shared files" is a fine answer. -->

## Verification
- [ ] `npm run test --if-present` passes in every touched app
- [ ] `npm run build` passes in every touched app
- [ ] CI is green (all four matrix jobs), and any new app under `apps/` was added to the matrix in `.github/workflows/ci.yml`
- [ ] No personal information anywhere in the diff — names, addresses, phone numbers, emails, employers, schools, resume content. For any `.docx`, that includes hyperlink targets in `.rels` parts and the author fields in `docProps/`, not just `document.xml`.
- [ ] Worklog updated at `.claude/worklogs/<branch>.md`
- [ ] Any schema change has its migration file in this PR

## Brief impact
<!--
Does this change contradict anything CLAUDE.md states — the domain map, env vars,
build order, a tool's design, or a stated decision?

If so, say what it contradicts and STOP. Do not edit CLAUDE.md in this PR: the
brief is approved before it is updated, never quietly alongside the code that
outdated it. Flagging it here is the whole job.

Write "none" if nothing in the brief is affected.
-->
