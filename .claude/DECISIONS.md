# Decisions, mistakes and traps

Read before reopening a question or when something bites. An entry stays only if a future session
would get something wrong without it: the rule, one line of why. App rules live in that app's
`RULES.md`, app traps in its `NOTES.md`. Supersede in place.

## Settled

- **Three roles: the TD architects, the builder builds, Deployment deploys** (2026-10-20, superseding
  TEC-115's "the TD merges"). Only Deployment writes to a pull request, and only on `/deploy`.
- **Only the owner starts the builder,** with `/build TEC-n` (2026-10-26, TEC-145). The TD writes
  the brief; a go on a proposal is not a start. Rule only, no hook: a stray start costs a branch.
- **Only the TD's session subscribes to a pull request,** Deployment's included, since it runs there.
  A second subscriber gets nothing.
- **The `tp-` prefix on Vercel project names stays.** Correct the document, not the live project.
- **Preview deployments stay off.** They rebuilt what CI built. A pre-merge stage needs
  preview-scoped env vars and a Supabase branch, which costs money (TEC-6).
- **`lib/models.ts` stays per-app.** The copies differ on purpose; stamping would erase that or
  keep `drift` red. Reopen if a fourth app needs an identical registry.
- **Login guessing is limited at Vercel's firewall, not in code** (TEC-7). No code, no database
  credential for the hub, and no shared counter a stranger could fill to lock the owner out.
- **Agents test live apps signed out only:** the login redirect, 401 on `/api/*`, a forged cookie,
  the headers. Agents never get the password.
- **A `drift` check must fail the case it exists for and pass the next legitimate edit.**

## Mistakes

- **Merging on a stale gate result.** Check the open list live as the first step of every merge.
- **Merging something green that contradicts a settled decision.** Hold it; ask the owner.
- **Inventing a full SHA from a short prefix.** Read the real one.
- **A heredoc delimiter in a commit message.** Read the message's last line before submitting.

## Traps

- **A failed read must never render as empty.** Fail the request (503) and leave client state
  `null`, not `[]`.
- **A push to a deleted branch recreates it with pre-squash history.** `git diff main branch`
  shows what really differs; cut a fresh branch.
- **A squash merge conflicts the rest of its stack.** If `main`'s copy matches what the stacked
  branch inherited, take the branch side; otherwise the conflict is real.
- **A green `build (app)` may not have built.** Out-of-scope jobs exit early as success; a skip
  logs `Nothing to do`.
- **Supabase stamps its own migration version.** Read `list_migrations` back and rename the file.
  Repo and database differ by exactly `20260908235234`.
- **`supabase db push` cannot work here:** that withheld seed is remote-only. Migrations go through
  the hosted API at merge.
- **A new Postgres schema inherits no grants;** exposing it is a dashboard setting that fails
  looking like a credentials problem.
- **Vercel bakes env vars in at build time.** A change reaches nothing until a rebuild.
- **A Vercel project's git link is stored on the project.** If deploys stop, read `link.org` before
  touching GitHub.
- **A `SESSION_SECRET` mismatch doesn't throw;** it silently rejects sessions on the other apps.
- **Vercel aliases the build that finishes last,** not the newest commit. After close merges to one
  app, check and promote the right build.
- **Branches cut before 2026-09-15 carry seven real names** (tracker fixtures). Never push one under
  its own name. Test with
  `git diff --name-only origin/main <branch> -- apps/tracker/lib/matchMeetings.ts apps/tracker/tests/`
  (empty means clean).

## Known, not fixed

- **Nine git objects in `refs/pull/*` carry those seven names, and the repo is public.** Only
  GitHub Support's sensitive-data removal clears them (TEC-116).
