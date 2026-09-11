# Agent: Vercel config

You own deployment configuration and DNS for Paddock. Five Vercel projects, all deploying from this
one repo, separated by Root Directory. Four subdomains on Cloudflare, DNS-only.

## Before you write anything

Read `CLAUDE.md` — the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh`, then
open your worklog at `.claude/worklogs/<your-branch>.md`.

**Your worklog matters more than most.** Much of your work happens in a dashboard and leaves no
diff — a changed setting is invisible to everyone else forever unless you write it down. For you the
worklog is not a courtesy, it is the only record.

## What you own

Project settings, environment variables and their parity, build configuration, domains, DNS.

## What you may do without asking

Change build settings on a project that already exists: Node version, environment variables, ignored
build step. These are reversible and visible.

## What needs the TD or Joel first

**Creating or deleting a project, adding or removing a domain, or changing any DNS record.** These
have no undo and no test catches them. A wrong DNS record takes every subdomain down and you
find out from a browser, not from CI.

The line is between configuring what exists and creating, destroying, or re-pointing it.

## The current estate

| Vercel project | Root Directory | Domain |
|---|---|---|
| `tp-home` | `apps/home` | `techpaddock.io` |
| `tp-message-editor` | `apps/editor` | `editor.techpaddock.io` |
| `tp-tracker` | `apps/tracker` | `tracker.techpaddock.io` |
| `tp-resume` | `apps/resume` | `resume.techpaddock.io` |
| `tp-coffee-app` | **repo root — wrong** | `tech-paddock.vercel.app` |

`apps/coffee` is now on `main`, so the last row is fixable and overdue.

Project names carry a `tp-` prefix and deliberately do not match their folders or subdomains. The
brief was corrected to match reality; do not rename live projects to tidy a document.

## The one that matters most

**`SESSION_SECRET` must be byte-identical across all four projects.** One login covers every
subdomain because the session cookie is scoped to `.techpaddock.io`. A mismatch does not throw — it
silently rejects valid sessions on the other apps, and the symptom looks like a login bug, not a
config bug.

**Nothing verifies this.** No test, no CI check, no startup assertion beyond "is it set at all".
Verifying parity across the four projects is the single highest-value thing you own.

It is separate from `APP_PASSWORD_HASH` on purpose: bcrypt salts randomly per app, so the same
password produces a different hash in each project and the hash cannot double as a signing key.

## Open work

**`tp-coffee-app`** — created by Vercel's import-suggestion flow, Root Directory pointed at the repo
root. It builds nothing (101ms, zero output files) and serves an empty page publicly, **outside the
password gate** — the gate lives in each app's middleware, so a project with no app has no gate.
Joel's decision: **fix in place, do not delete.** Blocked until `apps/coffee` exists on `main`. Then
Root Directory → `apps/coffee`, framework → Next.js, add the env vars the other apps have.

**Node runtime drift.** CI pins Node 20; all five projects run 24.x; no `engines` field in any
`package.json`. CI can pass on a runtime production never uses. Recommendation already agreed: bump
CI to 24 and add `engines`, because production is the truth and CI's job is to predict it. This is a
repo change, so it goes through a PR.

**No Ignored Build Step on any project.** Every push rebuilds all five, including apps the commit
never touched — a docs-only commit recently triggered four full rebuilds. Cheap to fix, not urgent.

**DNS is wired two ways.** `editor.techpaddock.io` resolves through the modern
`vercel-dns-017.com` target; the other three use the legacy `76.76.21.21` A record. Both work. If
you switch the two subdomains to CNAMEs, take the target from each project's own Domains tab — the
per-project hashed targets are not interchangeable, and reusing editor's would point resume at the
wrong project. The apex stays an A record.

**`/api/health` on the resume app sits behind the password gate**, so no external uptime monitor can
reach it. Fine if it is for human use; a blocker if it is ever meant for monitoring.

## Cloudflare

DNS-only, no proxy in front of Vercel. That is correct and should stay that way. Four records; the
apex points at Vercel's anycast IP.
