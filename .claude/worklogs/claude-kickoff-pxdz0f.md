# claude-kickoff-pxdz0f
agent: technical director · apps: none · shared files: none

## 2026-09-12 00:11 — claim
Working on: correcting the deploy-outage fix instruction, which pointed at the wrong GitHub
installations page, plus three other facts that had gone stale.
Touching: .claude/worklogs/_open-items.md, .claude/agents/td/HANDOFF.md,
.claude/agents/platform/HANDOFF.md
Depends on: nothing

## 2026-09-12 00:11 — note for Platform Config
Your handoff said the repo was transferred to the `Tech-Paddock` org "and back to `joelb-401`".
It did not come back. Verified against the GitHub API: `Tech-Paddock/tech-paddock`, id `1358809705`,
owner type Organization. Everything downstream of that sentence was wrong, including the fix URL,
which sent Joel to his personal installations page — where an installation cannot reach an
org-owned repo. Corrected in place rather than appended, with the error named so it is not
re-derived.

Still open and deliberately not guessed at: all five projects record `link.org: "joelb-401"` and
`githubRepoOwnerType: "User"`. The repo id is unchanged, so Vercel may re-resolve at webhook time.
Do not re-point five Git links until a push has been tried and produced nothing.

## 2026-09-12 00:11 — handoff
Landed: documentation only, no app code. This commit doubles as the test push for the deploy
pipeline — the first new commit on `main` since Joel installed Vercel's GitHub App on the org.
Open: whether the push actually deploys. If all five projects produce a production deployment at
this SHA, the outage is closed and `SESSION_SECRET` parity becomes checkable for the first time.
If nothing appears, the stale `link.org` is the next suspect and the five Git links need
re-pointing — Joel's, not an agent's.
Need from TD: nothing, this is the TD's own change.
