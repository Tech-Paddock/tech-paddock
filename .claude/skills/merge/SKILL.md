---
name: merge
description: Take a pushed branch to main — the pull request, the gate, any migration, the squash merge, and confirming it is live. The technical director's; a helper cannot write to a pull request.
---

# Merge

The gate that was the Deployment agent's until TEC-115 (2026-10-19). `CLAUDE.md` says what must be
true; this is the order. **Check the open list live first** — open pull requests, each branch head
against `main`, `list_migrations` — never from memory or an old report.

## 1. Before opening

- **The request is real and recorded.** You need Joel's words for this change. No request, no
  pull request.
- **It is not on Joel's list** (`CLAUDE.md`, *Joel approves*). If it is, bring it to him with a
  recommendation first — a pull request that contradicts something settled included. Green is
  not a reason to merge it.
- **Read the diff yourself**: blast radius as stated, no personal information, no check weakened,
  the app's `NOTES.md` describes what the change leaves behind (never "this branch is open").
  A stale `NOTES.md` goes back to the builder; do not fix it on the way past.
- **Run locally**: `node scripts/drift-check.mjs` (0 fail), `node scripts/stamp-shared.mjs
  --check`, `node --test .claude/hooks/guard.test.mjs`, and the touched app's tests.

## 2. Open it

Not a draft, against `main`, in `.github/pull_request_template.md`'s shape. The first line:

```
Requested by Joel on YYYY-MM-DD — "what he said"
```

Then what changed and why, blast radius, what was verified, and the **Deployment** section —
including any migration by name and its shape. Write only what you checked.

## 3. The gate

- **CI green on the current head** — `gate`, both runs (a push with a pull request open runs it
  twice). `main` requires branches up to date: after every merge, merge `main` into the rest (a
  merge commit, never a rebase), rerun step 1's checks, push, and wait for green again.
- **Several at once: decide the order first and say it.** A rule change goes after the work it
  would turn red; a correction others wait on goes first; when two touch one file, the conflict
  falls on the branch still being worked. A conflict between two versions of logic goes back to its
  author — never pick one.

## 4. A migration, before the merge

1. **Read its shape.** Unstated is destructive until you have read the SQL; destructive ships in
   two pull requests.
2. **Apply with `apply_migration`**, from the file's exact contents.
3. **Read `list_migrations` back.** The hosted API stamps its own version: rename the file on the
   branch to match, push, wait for green.

`supabase db push` cannot work here; `migration repair` is refused whoever asks.

## 5. Merge, then confirm it is live

**Squash merge** (the guard refuses anything else). Then read the production deployment of every
project the change rebuilds, and follow the pull request's own Verify line.

- **Read deployment state, never a project field.** `READY` at `target: production` is live,
  `BLOCKED` is paused, `CANCELED` at `target: null` is a skipped preview. `live: false` means
  something else, and reading it wrong cost a day.
- **Environment variables bake in at build time.** A changed one needs the live build redeployed;
  for a build the ignore step skipped, set `FORCE_BUILD`, redeploy, remove it — Joel's steps.
- **`SESSION_SECRET` cannot be read back**; parity is only knowable by setting one value everywhere
  and redeploying, and a paused project cannot take it.
- **`HEAD^..HEAD` in each `ignoreCommand` is right because merges squash.** The apex DNS record is
  an A record on purpose; every subdomain is a CNAME.
- **A parked app's red check is expected.** Check a red status against `main` first.

## 6. After

Linear: the integration closes an issue whose pull request names it — reopen it if Next steps
remain, and set each touched issue's status by `CLAUDE.md`'s table. Say which merged branches are
left; agents cannot delete them.
