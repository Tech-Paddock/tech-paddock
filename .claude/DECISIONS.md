# Decisions, mistakes and traps

The archive: read it before reopening a question or when something bites. Not read every session.

**An entry stays only if a future session would get something wrong without it.** Write the rule and
one line of why. History lives in git and Linear; a rule that binds an app lives in that app's
`RULES.md`, and app-specific traps live in its `NOTES.md`. Supersede in place: edit the entry, never
append a contradiction below it.

---

## Settled — do not reopen

- **TD + one builder + CI; Joel approves only what has no undo** (TEC-115, 2026-10-19). Seven agents
  differed only by charter and Deployment re-ran CI. The accepted cost: the TD merges its own work,
  so CI, `drift`, branch protection and the request line are the gate.
- **Only the TD's session subscribes to a pull request.** A second subscriber silently gets nothing.
- **The `tp-` prefix on Vercel project names stays.** Renaming live projects to tidy a document was
  declined; the document gets corrected instead.
- **Preview deployments stay off** (2026-09-17). They rebuilt what CI had already built, on URLs
  nobody opened. A drivable pre-merge stage needs preview-scoped env vars and a Supabase branch,
  which is infrastructure and money, so it is Joel's call (TEC-6).
- **`lib/models.ts` stays a per-app copy, not in `packages/shared`.** The copies differ on purpose
  (Coffee has an effort dial, Cookbook has no search), and stamping them would erase that or turn
  `drift` permanently red. Reopen only if a fourth app needs an identical registry.
- **Login guessing is limited at Vercel's firewall, not in code** (TEC-7). A per-IP rate limit on
  `POST /api/login`: no code, no database credential for the hub, and no shared counter a stranger
  could fill to lock Joel out everywhere. The password stays the real control.
- **Agents test the live apps signed out only** (2026-10-18): the login redirect, 401 on `/api/*`, a
  forged cookie, the headers. One password opens every app's data, so agents never get it.
- **A `drift` check is not finished until it fails the case it exists for and passes the next
  legitimate edit.** A check that fails a correct edit pushes people to do the thing it prevents.

## Mistakes — do not repeat

- **Merging on a gate result taken before the last merge.** Check the open list live as the first
  step of every merge; a list read twenty minutes earlier once missed a 47-file PR.
- **Merging something green that contradicts a settled decision.** Code already written pressures
  the rules to follow it. Hold it and put the question to Joel.
- **Inventing a full SHA from a short prefix.** Read the real one.
- **A heredoc delimiter reaching a commit message**, twice, by two different routes. Read the last
  line of a commit message before submitting it, wherever it is submitted.

## Traps — things that will bite you

- **A failed read must never render as an empty collection.** "Nothing here" and "could not look"
  draw the same screen. Fail the request (503) and leave client state `null`, not `[]`.
- **A merged branch can come back carrying everything.** A push to a deleted branch recreates it
  with its pre-squash history. `git diff main branch` shows what really differs; cut a fresh branch.
- **A squash merge conflicts the rest of its own stack.** Compare `main`'s copy against what the
  stacked branch inherited: identical means taking the branch side is lossless; otherwise it's real.
- **A green `build (app)` doesn't mean the app was built.** Out-of-scope jobs exit early as success
  so the required check is satisfied. A skip says `Nothing to do`; read the job, not the tick.
- **Supabase stamps its own migration version** and ignores the filename. Read `list_migrations`
  back after applying and rename the file. Repo and database differ by exactly `20260908235234`.
- **`supabase db push` can never work here**: that withheld seed is remote-only on purpose. Migrations
  are applied through the hosted API at merge time.
- **A new Postgres schema inherits no grants**, and exposing it is a dashboard setting. Three steps;
  the third lives outside the repo and fails looking like a credentials problem.
- **Vercel bakes environment variables in at build time.** A dashboard change reaches nothing until
  that project rebuilds.
- **A Vercel project's git link is stored on the project**, not derived from the GitHub App. If
  deploys stop, read `link.org` on the project before touching GitHub. It once cost six hours.
- **A `SESSION_SECRET` mismatch doesn't throw.** It silently rejects valid sessions on every other
  app and looks like a login bug.
- **Vercel aliases the build that finishes last, not the newest commit.** Merges close together that
  touch the same app, or home, can leave an older build live; promote the right one.
- **Branches cut before 2026-09-15 carry seven real names** (tracker fixtures). Never push one under
  its own name: that recreates it publicly. Test with
  `git diff --name-only origin/main <branch> -- apps/tracker/lib/matchMeetings.ts apps/tracker/tests/`
  (empty means clean).

## Known, deliberately not fixed

- **Nine git objects in `refs/pull/*` still carry those seven real names, and the repo is public.**
  GitHub owns those refs: no push or branch deletion removes them, only GitHub Support's
  sensitive-data removal. Joel's request to make.
