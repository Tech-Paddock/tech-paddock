---
name: merge
description: Take a pushed branch to main — the pull request, the gate, any migration, the squash merge, and confirming it is live. Deployment's alone; the guard refuses a pull request write from anyone else.
---

# Merge

`CLAUDE.md` says what must be true; this is the order. **Check the open list live first:** open
pull requests, each branch head against `main`, `list_migrations`.

## 1. Before opening

- **The request is recorded.** The brief carries the owner's words; none, no pull request.
- **Check the owner-approval list** (`CLAUDE.md`). If it is on it without approval, or contradicts
  something settled, hold it and report it with a recommendation.
- **Read the diff:** blast radius as stated, no personal information, no weakened check, and
  `NOTES.md` describes the state after merge. A stale `NOTES.md` goes back to the builder.
- **Run locally:** `node scripts/drift-check.mjs` (0 fail), `node scripts/stamp-shared.mjs --check`,
  `node --test .claude/hooks/guard.test.mjs`, and the touched app's tests.

## 2. Open it

Ready (not draft), against `main`, in `.github/pull_request_template.md`'s shape, starting:

```
Requested on YYYY-MM-DD — "the request, quoted"
```

Then what changed and why, blast radius, verification, and the Deployment section, with any
migration by name and shape. Write only what you checked.

## 3. The gate

- **CI green on the current head:** `gate`, both runs (a push with a pull request open runs it
  twice). After every merge, merge `main` into the remaining branches (merge commit, never rebase),
  rerun step 1's checks, push, wait for green.
- **Several at once: state the order first.** A rule change goes after the work it would turn red;
  a correction others wait on goes first; when two touch one file, the conflict falls on the branch
  still in progress. A conflict between two versions of logic goes back to its author.

## 4. Migration, before the merge

1. **Read its shape.** Unstated means destructive until the SQL says otherwise; destructive ships
   in two pull requests.
2. **Apply with `apply_migration`** from the file's exact contents.
3. **Read `list_migrations` back,** rename the file on the branch to the stamped version, push,
   wait for green.

`supabase db push` cannot work here; `migration repair` is refused.

## 5. Merge and confirm

**Squash merge.** Then read the production deployment of every project the change rebuilds, and
follow the pull request's Verify line.

- **Read deployment state, not a project field.** `READY` at `target: production` is live,
  `BLOCKED` is paused, `CANCELED` at `target: null` is a skipped preview. `live: false` means
  something else.
- **Env vars bake in at build time.** A changed one needs a redeploy; for a build the ignore step
  skipped, the owner sets `FORCE_BUILD`, redeploys, then removes it.
- **`SESSION_SECRET` cannot be read back.** Parity is known only by setting one value everywhere and
  redeploying; a paused project cannot take it.
- **`HEAD^..HEAD` in each `ignoreCommand` is correct because merges squash.** The apex DNS record is
  an A record on purpose; every subdomain is a CNAME.
- **Check a red status against `main` first.** Red there too is not the branch's.

## If it breaks production

Revert, don't roll back: a Vercel rollback is a Vercel write and the owner's. Open a pull request
reverting the squash commit (`git revert <merge commit>` on a fresh `claude/<app>-revert-<change>`
branch), request line quoting the owner's go, and merge it like any other. A migration it shipped
stays: say so, and what the old code does with the new column. Reopen the issue.

## 6. After

**Close what shipped, once it is live.** For each issue the branch names:

- Mark the Next step it delivered `Done YYYY-MM-DD`.
- **Every step done, or only an owner phone check left:** status Done, unassigned. A phone check
  left gets the `Phone check` label instead of holding it open. When one issue has several
  branches, only the last one to go live closes it.
- **Steps left:** reopen it if the merge closed it; status per `CLAUDE.md`; assigned to the owner
  only while a ⭐ step waits on them.
- Put each issue and what you set it to in your report.

List merged branches still on the remote; agents cannot delete them.
