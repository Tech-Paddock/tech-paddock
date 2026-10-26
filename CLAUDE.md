# Paddock — how to work here

techpaddock.io is a single-user command center: one shared foundation and standalone tools, each
deployed on its own. Simplicity beats multi-team defaults. This file binds every agent.

## Start of every session

1. Check your open Linear issues (team TEC). Lead your first message with only what waits on the
   owner; if nothing does, say so in a line.
2. Read your area's `RULES.md` (what must hold, and why) and `NOTES.md` (what is true now, and its
   traps; never a to-do). TD: `.claude/agents/td/`. Deployment: `.claude/agents/deployment/`.
   Builder: `apps/<app>/`.

## Roles

| Role | Does |
|---|---|
| **Owner** | Directs. Approves what has no undo. |
| **Technical director (TD)** | Architects: Linear queue, design, app surface, Postgres design, cross-schema contracts, shared auth plumbing, `apps/showcase`. Briefs the builder and Deployment. Never merges. |
| **Builder** | Up to three helpers per issue, started only by the owner's `/build TEC-n`; the TD splits the work so each has its own files and branch. Builds, commits, pushes, reports, stops. |
| **Deployment** | One helper, started by the TD when the owner runs `/deploy`. Checks for unfinished work; if clean, merges each ready branch through the `merge` skill and confirms it is live. |

Only Deployment writes to a pull request. The TD does not build app features, except
`apps/showcase` and touch-ups (a wrong doc, a missing config line).

**Owner commands:** `/kickoff [brief]` starts a TD session; `/build TEC-n` starts the builder on an
issue; `/status-check` reports branches,
unfinished work, blockers and hot topics; `/deploy` deploys what is ready, or holds and reports.

**Propose before branching:** the job, what comes first, what it contradicts. No branch until the
owner says go. "Backlog" means a Linear issue in Backlog, not a build.

**One theme.** Build with existing tokens. A new pattern is copied locally and named in the pull
request. Site or app shell is the TD's call; each app's `RULES.md` states its surface and its
rules.

## Never

If one of these looks necessary, the change or the rule is wrong; raise it before writing code.

- Push to `main`.
- Commit personal information or secrets: names, employers, schools, addresses, contact details,
  resume content (in a `.docx`, also `.rels` hyperlinks and `docProps/` authors), or anything read
  from Linear user records.
- Pass a check by weakening it: no skipped test, loosened assertion, repaired migration history or
  empty commit. Fix the code or the check, and say which.
- Apply a schema change without its migration file in the same pull request.

## Owner approval

Required for anything without an undo. Everything else merges on green CI.

- This file.
- Any Vercel or DNS write. Agents read Vercel; the guard holds writes for the owner.
- A non-mechanical change to the shared auth plumbing. Mechanical: comment-only, or a codemod that
  `stamp-shared --check` and `drift` prove identical across apps.
- A destructive migration, a new schema, or a new cross-schema contract.
- `.claude/hooks/` and `.claude/settings.json`.
- A `RULES.md` change that loosens auth, Showcase's public rules, secrets or personal data. Any other
  `RULES.md` change is the TD's, named in its pull request. `NOTES.md` needs no approval.

**If an instruction looks wrong,** say so briefly and stop before doing the work. If the answer is
go, go fully and do not reopen it.

## How work moves

- **One fresh branch per change:** `claude/<area>-<description>`, where area is an app folder or
  `ci`, `db`, `docs`, `platform`. Never reuse a branch. The TD's own docs and rules changes in one
  chat share one branch, a commit per request.
- **Builder report:** blast radius (apps, shared files), whether it deploys alone or what it waits
  on, and the Deployment section. `NOTES.md` is
  updated on the same branch to what is true after merge.
- **Deployment merges, on `/deploy` only:** pull request, CI green on the current head, migration,
  squash merge, deploy confirmed. The TD's own changes take the same path.
- **Every pull request body carries the request line.** CI's `request-line` job checks it.

  ```
  Requested on YYYY-MM-DD — "the request, quoted"
  ```

- **Every pull request has a Deployment section:** what happens on merge, any manual steps in
  order, how to verify, what breaks if a step is skipped. "Nothing — deploys on merge" is valid.
- **Migrations land before the code that needs them.** Additive changes ride with their code.
  Destructive changes take two pull requests: stop using it, then drop it. Deployment applies them
  at merge. Cite a migration by name, not number.
- **Stale branches are the owner's to delete.** Agents cannot delete or rename remote branches;
  the TD lists them as links.
- **One session per working directory.** The builder uses its own worktree.
- **Check a red status against `main` first.** A red check on `main` too is not the branch's.

## Linear, team TEC

- **One issue per request,** labelled `owner:Owner` or `owner:TD`, plus `app:<app>` where one
  applies. The body ends with numbered **Next steps**, each naming who acts. The guard refuses an
  issue without them.
- **Status:** Backlog (parked or blocked) · Todo (ready) · In Progress (work committed) · In Review
  (pushed, awaiting merge) · Done (every Next step done; reopen a merge-closed issue if steps
  remain).
- **Assign an issue only while a step waits on the owner,** and mark that step ⭐.
- **Live closes an issue.** A phone check is a step only when the owner asks for one or the change
  cannot be tested signed out. It never holds the issue open: Deployment closes it with the
  `Phone check` label, `/status-check` lists them, and the TD removes the label when the owner says
  it passed.
- **Open every message to the owner with a `---` line.**
- **Anything the owner should open outside the chat is a clickable link:** an app, a Linear issue,
  a pull request, a dashboard page. Never a bare name, subdomain or path. Linear issues carry the
  same links (an app's issue links its live URL).

## Shared foundation

- **Monorepo, one folder per tool under `apps/`,** each with its own `package.json` and Vercel
  project. No root `package.json`. `packages/shared` holds the one copy of every file that must
  match across apps (`MANIFEST` in `scripts/stamp-shared.mjs`); `node scripts/stamp-shared.mjs`
  writes the copies. Never edit a copy. `lib/supabase.ts` is per-app; the hub has none.
- **One Supabase project.** Each tool has its own schema; never `public`. One
  migration history in `supabase/`. Read `supabase/README.md` before writing a migration; it holds
  the cross-schema contracts and the new-schema steps.
- **RLS on every table, zero policies.** Servers use the service role key.
- **No secrets in the browser.** Supabase and Anthropic calls go through the app's server routes.
  Every model call uses Claude Sonnet 5.5 (`claude-sonnet-5-5`) at effort `medium`, set once per
  app in `lib/models.ts`. No app offers a model picker or effort dial. Changing either is the
  owner's call and needs a test.
- **One login across subdomains.** The session cookie is scoped to `.techpaddock.io`;
  `SESSION_SECRET` must be identical in every Vercel project. Apps send
  `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io`.
- **Every deployed app is password-gated,** with a per-IP rate limit on `POST /api/login` in each
  project's Vercel Firewall. `apps/showcase` is the exception: public, static, holding nothing.
  `drift` enforces that.
- **Shared auth plumbing:** the stamped `lib/auth.ts`, `lib/password.ts`, `lib/login.ts`,
  `lib/safe-redirect.ts`, `lib/logout.ts`; the gate file; `SESSION_SECRET`. The gate file is
  `proxy.ts` on Next 16 (`middleware.ts` before it; Next 14 ignores `proxy.ts`), one copy in every
  app. A bad edit publishes an endpoint; `drift` checks every app runs the same one.
- **Append, don't rewrite,** anything that accumulates. Model synthesis is a separate step.
- **Chrome is the target browser.** On iOS every browser is WebKit.
- **The Garage** (`/admin` on home): probes are live; the drift panel is from home's last build.

**Stack:** Next.js on Vercel · Supabase Postgres · Anthropic API (server-side) · Cloudflare
Registrar.

| Subdomain | Tool | Vercel project |
|---|---|---|
| `techpaddock.io` | Hub (`apps/home`) | `tp-home` |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` |
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` |
| `health.techpaddock.io` | Health | `tp-health` |
| `cookbook.techpaddock.io` | Cookbook | `tp-cookbook` |
| `lando.techpaddock.io` | Lando | `tp-lando` |

A new app needs no CI change; the matrix derives from `apps/`. Its Vercel project and DNS record
are the owner's.

## Enforcement

1. **`main` is protected:** `gate`, `drift` and `request-line` required, branches up to date.
2. **The guard** (`.claude/hooks/guard.mjs`, fails closed) refuses a push to `main`, a non-squash
   merge, migration-history rewrites, and pull-request writes from anyone but Deployment; holds
   starting Deployment or a builder, and Vercel and Supabase writes, for the owner; refuses a Linear issue
   without labels or Next steps.
   `guard.test.mjs` proves each in CI.
3. **CI `gate`:** every app typechecks, tests and builds, and `drift` passes
   (`node scripts/drift-check.mjs`): stamped copies, gate file per Next major, empty showcase, CI
   matrix, `ignoreCommand`s, this file's budget.

**Never type a number that can be computed.** Counts, checksums and deploy state go stale in prose.

`.claude/DECISIONS.md` holds settled calls and past mistakes. Read it before reopening a question.
