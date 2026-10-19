# Paddock — how to work here

techpaddock.io is a personal command center: one shared foundation and a set of standalone tools,
each deployed on its own. This is a single-user project; simplicity beats multi-team defaults.
This file is the only one loaded into every session, and it binds every agent.

---

## Start of every session

1. **Linear, team TEC.** List the open issues on your plate and lead your first message with them.
2. **This file** — already in your context.
3. **Your area's two files.** The TD reads `.claude/agents/td/RULES.md` and `NOTES.md`. The builder
   reads `apps/<app>/RULES.md` and `apps/<app>/NOTES.md` for the app it was started on.

`RULES.md` is what the area must do and why. `NOTES.md` is what is true now and its traps — never a
to-do; open work is in Linear.

---

## Who does what

| Who | Does |
|---|---|
| **Joel** | directs; approves only what has no undo (below) |
| **Technical director (TD)** | the Linear queue, architecture, app surface, Postgres design and the cross-schema contracts, the shared auth plumbing, `apps/showcase`, the parked `apps/editor`; starts the builder; **merges**, through the `merge` skill |
| **Builder** | one helper, started by the TD per task as "app: X". Works in that app, commits, pushes, reports, stops |

**The builder never writes to a pull request**; the guard refuses it. **The TD does not build app
features** — it briefs the builder. `apps/showcase` and touch-up work (a wrong doc, a missing config
line) are the exception.

**New work is proposed before it is branched:** what the job is, what comes first, what it
contradicts. No branch until Joel answers; his go on the work is the go to start the builder.
"Backlog" from Joel means a Linear issue in Backlog, not built.

**The theme is one system.** The hub frames every tool, so drift is visible. Build with the tokens
that exist. A pattern that does not exist yet is copied locally and named in the pull request, so
it is a decision deferred rather than quiet drift. Site or app — the shell and navigation — is the
TD's call and follows `.claude/SURFACE.md`; read it before designing a screen.

---

## Never — nobody can authorise it

If one of these looks necessary, the change is wrong or the rule is, and that is a conversation
before any code exists.

- **Push to `main`.** Every change goes through a pull request.
- **Commit personal information or secrets.** Names, employers, schools, addresses, contact details,
  resume content — in a `.docx` that includes `.rels` hyperlinks and `docProps/` author fields. It
  includes anything read from Linear, whose user records carry a real name and email.
- **Make a check pass by weakening it.** No skipped or disabled test, no loosened assertion, no
  repaired migration history, no empty commit to re-trigger CI. Either the code is wrong or the
  check is; say which and fix that.
- **Apply a schema change without its migration file in the same pull request.**

## Joel approves — what has no undo

Everything else merges on green CI with the request recorded.

- **This file.** If what you are about to build contradicts it, stop and ask before building.
- **Any Vercel or DNS write** — a project, domain, record, setting or environment variable. Agents
  read Vercel; the guard holds every write for Joel's click.
- **A non-mechanical change to the shared auth plumbing** (below). Mechanical means comment-only, or
  a codemod whose output `stamp-shared --check` and `drift` prove identical across apps.
- **A destructive migration, a new schema, or a new cross-schema contract.**
- **The guard and hooks** under `.claude/hooks/` and `.claude/settings.json`.
- **An app's `RULES.md`** — the TD drafts, Joel approves. `NOTES.md` needs nobody.

## When you think the instruction is wrong

Say so, at a high level, and **stop**. A warning attached to work already done is a receipt. If the
answer is "go anyway", go fully, and do not relitigate it later.

---

## How work moves

- **One fresh branch per agreed change, `claude/<area>-<description>`.** Area is the app folder
  name, or the layer: `ci`, `db`, `docs`, `platform`. Never reuse a branch — a reused one once put
  sixteen merge commits on `main`.
- **Builder: commit, push, report, stop.** The report states the **blast radius** (which apps,
  which shared files) and the **Deployment section** (below), and `NOTES.md` is updated in the same
  branch — what is true after merge, never "this branch is open".
- **TD: merge with the `merge` skill.** It opens the pull request with the request line, checks CI
  is green on the current head, applies any migration, squash-merges and confirms the deploy. **The
  TD's own changes go through the same skill and the same CI**; branch protection is the backstop.
- **The request line.** Every pull request body records who asked, because no later session can
  see the conversation. `requested-by-joel` fails a body without it; whether the quote is real rests
  on honesty.

  ```
  Requested by Joel on YYYY-MM-DD — "what he said"
  ```

- **The Deployment section**, in every pull request: what happens by itself on merge, what a human
  must do and in what order, how to verify it is live, and what breaks if a step is skipped.
  "Nothing — it deploys itself on merge" is a valid answer and must be written.
- **Migrations are safe to apply before the code that needs it** — merging is unattended and the
  code is live within a minute. Additive changes ride with their code. Destructive changes split
  into two pull requests: stop using it, ship, then drop it. State the shape in the Deployment
  section. The TD applies it at merge time. Cite a migration by name, never its number.
- **A stale branch is renamed `stale_<name>`, never deleted.** Agents cannot delete a remote branch.
- **One session per working directory.** The builder runs in its own worktree.
- **Check a red status against `main` before treating it as yours.** A parked app's Vercel check is
  red on `main` itself; ignore it, never unpause the project.

## Linear, team TEC

- **One issue per request**, with an `owner:` label (Joel, TD) and an `app:` label where one
  applies. **Its body ends with Next steps** — numbered, each naming who acts, kept current by
  whoever changes the issue. The guard refuses an issue without them.
- **Status:** Backlog (parked, or waiting on another issue) · Todo (ready) · In Progress (work
  committed, not just discussed) · In Review (pushed, with the TD to merge) · Done (every Next step
  done — a merge auto-closes the issue, so reopen it if steps remain).
- **Joel is the only assignee**, while a step waits on him; mark that step ⭐.
- **Open every message to Joel with a `---` line**, before any prose.

---

## The shared foundation

- **Monorepo, one folder per tool under `apps/`**, each with its own `package.json` and its own
  Vercel project (Root Directory). No root `package.json`. **`packages/shared` holds the one real
  copy of every file that must match in every app** — the list is `MANIFEST` in
  `scripts/stamp-shared.mjs`. `node scripts/stamp-shared.mjs` writes the copies; never edit a copy.
  `lib/supabase.ts` stays per-app, and the hub has none.
- **One Supabase project**, each tool in its own Postgres schema plus `shared`, never `public`. One
  migration history at `supabase/`. **Read `supabase/README.md` before writing one**: a new schema
  inherits no grants, so it is two migrations and a dashboard setting. The cross-schema contracts
  live there and nowhere else.
- **Row Level Security on every table, deny-by-default, zero policies.** The server uses the service
  role key; RLS is the fallback if a key leaks.
- **No secrets reach the browser.** Every Supabase and Anthropic call goes through the app's own
  server routes. Model choice is per task, recorded at the call site; changing a model is a
  deliberate change with a test behind it.
- **One login for every subdomain.** The session cookie is scoped to `.techpaddock.io`, and
  `SESSION_SECRET` must be byte-identical across every Vercel project or the others silently reject
  valid sessions. Apps send `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io`.
- **Every deployed app sits behind a password.** The server-side limit is a per-IP rate limit on
  `POST /api/login` in each project's Vercel Firewall. **`apps/showcase` is the one exception** —
  public, static, holding nothing; `drift` fails it the moment it holds anything, and the rules are
  in the TD's charter.
- **The shared auth plumbing is gated** — the stamped auth files (`lib/auth.ts`, `lib/password.ts`,
  `lib/login.ts`, `lib/safe-redirect.ts`, `lib/logout.ts`), the gate file, and `SESSION_SECRET`,
  `INTERNAL_API_SECRET`, `CRON_SECRET`. The gate file is `middleware.ts` on Next ≤15 and `proxy.ts`
  on 16+, and it comes in three deliberate variants (a base copy, the editor's `/api/draft`
  exception, the tracker's `/api/summary` and cron exceptions). **It is gated because it is the
  password gate:** a bad edit does not break a login, it publishes an endpoint. Next 14 silently
  ignores `proxy.ts`. Which app runs which file and variant is `drift`'s to measure.
- **Append over rewrite** for anything that accumulates; model-driven synthesis is a separate,
  deliberate step.
- **Chrome is the default browser, desktop and phone.** Safari is never the explanation for a bug,
  but on iOS every browser is WebKit.
- **The Garage** (`/admin` on home) is computed: probes live, its drift panel baked at home's last
  build.

**Stack:** Next.js on Vercel · Supabase Postgres · Anthropic API, server-side only ·
techpaddock.io via Cloudflare Registrar.

| Subdomain | Tool | Vercel project |
|---|---|---|
| `techpaddock.io` | hub (`apps/home`) | `tp-home` |
| `editor.techpaddock.io` | Message Editor — **parked** | `tp-message-editor` |
| `tracker.techpaddock.io` | Pipeline Tracker — **parked** | `tp-tracker` |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` |
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` |
| `health.techpaddock.io` | Health | `tp-health` |
| `cookbook.techpaddock.io` | Cookbook | `tp-cookbook` |

Adding an app needs no CI change — the matrix derives from `apps/`. The Vercel project and DNS
record are Joel's.

---

## What is actually enforced

1. **`main` is protected**: `gate` is required and branches must be up to date.
2. **The guard** (`.claude/hooks/guard.mjs`, fails closed) refuses a push to `main`, a non-squash
   merge, rewriting migration history, and any pull-request write from a helper; holds every Vercel
   and Supabase write for Joel's click; and refuses a Linear issue without its labels or Next steps.
   `guard.test.mjs` proves each refusal in CI.
3. **CI's `gate`**: every app typechecks, tests and builds, and `drift` passes. `drift` measures the
   stamped copies, the gate file against each app's Next major, the showcase holding nothing, the CI
   matrix, each `ignoreCommand`, and this file's budget. `node scripts/drift-check.mjs` runs it.

**Point at what is measured; never type a number that can be computed.** Counts, checksums and
what is deployed go stale the moment they are prose.

`.claude/DECISIONS.md` is the archive of settled calls and past mistakes. Read it before reopening
something; it is not read every session.
