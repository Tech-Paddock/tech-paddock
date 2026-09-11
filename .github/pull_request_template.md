## What changed

## Why

## Verification
- [ ] `npm run test --if-present` passes in every touched app
- [ ] `npm run build` passes in every touched app
- [ ] CI is green (all four matrix jobs), and any new app under `apps/` was added to the matrix in `.github/workflows/ci.yml`
- [ ] No personal information anywhere in the diff — names, addresses, phone numbers, emails, employers, schools, resume content. For any `.docx`, that includes hyperlink targets in `.rels` parts and the author fields in `docProps/`, not just `document.xml`.

## Brief impact
<!--
Does this change contradict anything CLAUDE.md currently states — the domain map,
env vars, build order, a tool's design, or a stated decision? If so, update
CLAUDE.md in this same PR. The brief drifting behind the deploy is a recurring
problem here; it is cheaper to fix in the PR than to reconstruct later.
Write "none" if nothing in the brief is affected.
-->
