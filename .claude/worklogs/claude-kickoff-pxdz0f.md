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

## 2026-09-12 00:27 — the org installation was necessary but not sufficient
Recording the sequence, because the diagnosis in the Platform handoff was right about the cause and
incomplete about the remedy.

Installing Vercel's GitHub App on the `Tech-Paddock` org did **not** restore deploys on its own. A
branch push at 00:12:40 reached GitHub — CI ran on it — and produced zero deployments across all
five projects four minutes later.

What proved the installation was fine was an accident: a sixth Vercel project was created from
Vercel's import flow at 00:16:06 and deployed `ff9d630` to production two seconds later, carrying
`githubOrg: Tech-Paddock` and `githubRepoOwnerType: Organization`. So Vercel could see the org repo;
the five old projects simply held a stale link and nothing on the GitHub side could rewrite it.

**The link is stored on the Vercel project, not derived from the installation.** Removing the
personal `joelb-401` installation changed nothing. Each project had to be disconnected and
reconnected to `Tech-Paddock/tech-paddock` individually, in Vercel's own Settings → Git.

Verified after the reconnect: all five read `org: Tech-Paddock`, and every custom domain survived —
`techpaddock.io`, `editor.`, `tracker.`, `resume.` still attached, and `tp-coffee-app` still holds
`tech-paddock.vercel.app`. Environment variables are not API-readable, so `SESSION_SECRET` parity
across the five is still unconfirmed and is the next thing to check once deploys land.

Left behind and needing disposal: the accidental sixth project, `tech-paddock`
(`prj_T0L27CLJWQizV70mOrOgzxzktuES`). It points at the repo root with no app under it and serves a
public, ungated 404 on three `.vercel.app` hostnames — checked, not assumed. Joel said he would
delete it.
