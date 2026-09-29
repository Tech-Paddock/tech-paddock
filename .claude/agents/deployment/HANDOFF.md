# Deployment — handoff

State as of 2026-09-29. `RULES.md` has the job and the gate; this is only the state of deployment
and its traps. Open work is in Linear, team TEC, labelled `agent:Deployment`. Branch and pull request
state is never written here — read it live.

---

## What is true now

- **Joel's click when the TD starts you is the one gate** (Joel, 2026-09-26). The guard holds that
  start, refuses it from inside a helper, and **refuses every pull request write to anyone but
  you**. It knows you by `agent_type: deployment` and an `agent_id` on the hook input — documented,
  **not yet seen live**: if your first pull request write after that change is refused as "not
  Deployment", the field is missing, and only Joel can merge the fix, from GitHub. Squash merges and
  body edits keeping the request line pass; auto-merge and reviews ask; a non-squash is refused.
  **Nothing enforces the brief's scope**, so a branch outside it is not yours to merge.
- **As a helper you make your own Linear writes**: statuses and Next steps as you merge, without a
  prompt (TEC-59, TEC-67). `delete_*` and `retire_*` still ask; the Linear diff tools are yours
  alone and still ask, since `merge_diff` would merge outside the guard.
- **Linear statuses and assignees follow the table in `CLAUDE.md`.** In Review means the branch is
  with Deployment; once it merges, the issue is In Progress while steps remain, Done when none do.
  Joel's ⭐ steps are dashboard work and decisions, never a merge click.
- **GitHub's *Automatically delete head branches* is on** in effect. Check with
  `git ls-remote --heads`, not a local `git branch -r`, which keeps stale refs until a prune.
- **`INTERNAL_API_SECRET` is one team-shared variable** linked to `tp-home`, `tp-tracker` and
  `tp-message-editor` since 2026-09-25 (Vercel's audit log). The hub's live build carries it; the
  paused tracker and editor stay on 2026-09-24 builds from before it (Joel's call). **Until they
  rebuild, a 401 or no answer from the tracker means its build predates the value**, not that
  values disagree.
- **The migration history is clean**: the repo and `list_migrations` differ by exactly
  `20260908235234`, withheld because it seeds personal data.

## Traps only here

- **Linear's GitHub integration moves issues on its own.** It sets In Progress when a linked pull
  request opens and Done when one that closes the issue merges, even with Next steps left. After
  the run, re-read each linked issue and list the status the table wants.
- **Helper worktrees live under `.claude/worktrees/`** and `.gitignore` ignores them (TEC-48).
  **Never commit that folder**, whatever the Stop hook asks. **Another helper's worktree may hold a
  branch you need**: check it out under a local alias and push `alias:claude/<branch>` — and only
  once the TD says that agent has finished with it.
- **A push to another agent's branch can be refused** by the session's permission check, even
  within the brief (TEC-53, 2026-09-29). Do not route around it; the owner pushes, and once the
  pull request is open, `update_pull_request_branch` (a full head SHA) brings it up to date. **Apply a migration only once the
  branch is pushable** — that refusal came after the apply, leaving the database ahead of `main`.
- **You cannot rename a remote branch to `stale_`:** it takes deleting the old name, which agents
  cannot do. Say which branch is stale; Joel removes it.
- **A helper worktree refuses git inside a loop, a variable or a `git -C`.** Run each git command
  plainly; write a file first (`git show … > file`) when another tool needs a branch's content.
- **`gh` is not installed.** Read check runs with `curl` on
  `api.github.com/repos/…/commits/<sha>/check-runs`. **With a pull request open, one push runs
  `gate` twice**, and a merge is refused while the second is only queued: wait for both.
- **A stacked branch conflicts once its base squash-merges**, on every file both touched. Test
  first (`DECISIONS.md`): `main`'s copy against the base tip the branch stacked on. Identical, take
  the branch side; that held for every conflict of the second train.
- **The hosted API renames migrations.** Read `list_migrations` back before merging, never after,
  and rename the file on the branch. Two consequences: **a handoff citing the old id goes stale**
  (`drift` warns) and goes back to its author before merge; and **a stacked branch still carrying
  the old name brings it back** when `main` is merged in — delete the duplicate before pushing.
- **A train can stop overnight between merges.** Resume from live state — the open pull requests,
  each head against `main`, and `list_migrations` — never from a brief's table or an old report.
- **`drift`'s `fresh:` ignores a commit spanning several agents' apps** (TEC-44). A `fresh:`
  warning is about that agent's own work, and never yours to fix by editing their handoff.
- **A project env read cannot see team-shared variables.** `SESSION_SECRET` and `APP_PASSWORD_HASH`
  are shared ones, so a project read that lacks them proves nothing.
- **The Vercel connector lists write tools. Do not use them** — hand Joel the step.
- **Read the real head SHA before passing `expectedHeadSha`.** An invented one is rejected.
