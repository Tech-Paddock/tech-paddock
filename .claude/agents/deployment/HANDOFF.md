# Deployment — handoff

State as of 2026-09-25. `RULES.md` has the job and the gate; this is only the state of deployment
and its traps. Open work is in Linear, team TEC, labelled `agent:Deployment`. Branch and pull request
state is never written here — read it live.

---

**The seat has run.** Its first train, on 2026-09-25 (Joel: "Merge everything"), took the `drift`
ceiling raise for `CLAUDE.md`, the Linear status and assignee rule in `CLAUDE.md`, and the Linear
permission rule in `.claude/settings.json` to `main`, in that order, each through Joel's click. The
merge commits are in `git log`; the issues they served are TEC-45 and TEC-43.

## What is true now

- **Every merge waits for Joel's click** (Joel, 2026-09-25: "Yes merging should check with me").
  The guard asks on `merge_pull_request`; opening a pull request does not ask. A denied click is a
  stop: report it, never route around it.
- **Linear writes go through without a prompt**; `delete_*`, `retire_*` and the Linear diff tools
  still ask, since `merge_diff` would merge a pull request outside the guard's hold. The rule loads
  when a session starts, so a session begun before it landed still prompts.
- **Linear statuses and assignees follow the table in `CLAUDE.md`.** In Review means the branch is
  with Deployment; once it merges, the issue is In Progress while steps remain, Done when none do.
  Unassign Joel and mark his ⭐ steps done once he has clicked the merge he was waiting on.
- **GitHub's *Automatically delete head branches* is on** in effect: the three branches of the first
  train were gone from the remote as soon as each merged. Check with `git ls-remote --heads` rather
  than a local `git branch -r`, which keeps stale refs until a prune.
- **Every app is live on the login hardening** (#201) except the parked ones, whose Vercel projects
  Joel pauses. Read deployment state before assuming either is serving new code.
- **`INTERNAL_API_SECRET` is not yet one value.** Rotating it to one value on `tp-home`,
  `tp-tracker` and `tp-message-editor` is TEC-33 step 1, Joel's, and has not happened; that step
  also adds it to `tp-home`, which may not hold it at all. Until it is done, a 401 from the hub's
  glance or the editor's draft button means the rotation is pending, not that three values disagree.
- **The migration history is clean**: the repo and `list_migrations` differ by exactly
  `20260908235234`, withheld because it seeds personal data.

## Traps only here

- **Linear's GitHub integration moves issues on its own, whatever `CLAUDE.md`'s table says.** It
  sets an issue to In Progress when a pull request linked to it opens — over In Review, which the
  table says it should be — and to Done when a pull request that closes it merges, even with Next
  steps left (TEC-40 went Done on its merge; TEC-43 and TEC-45 only went In Progress). After every
  merge, re-read each linked issue and set its status by the table, and read them once more at the
  end of the run, since the integration can fire after your edit.
- **Helper worktrees live under `.claude/worktrees/`** — every preset sets `isolation: worktree`.
  **Never commit that folder**, whatever the Stop hook asks; committing it pushes a nested checkout.
  `.gitignore` ignores it (TEC-48), so a folder there that shows as untracked means that line is gone.
- **`gh` is not installed.** Read check runs through the GitHub connector, or unauthenticated
  `curl` on `api.github.com/repos/…/commits/<sha>/check-runs`, and wait on the `gate` run for the
  exact head you pushed.
- **The hosted API renames migrations.** It records its own version and ignores the filename. Read
  `list_migrations` back before merging, never after, and rename the file on the branch to match.
- **A merge makes every other open pull request stale**, because `main` requires branches to be up
  to date. Budget a CI run per branch per merge; a stacked branch whose base squash-merged takes
  `main` by a merge commit, and when its content already matched, the merge changes no file.
- **Stamped files make every app handoff look stale.** A change to `packages/shared` rewrites a file
  in every app, so `drift`'s `fresh:` check warns on every app agent at once (TEC-44). That is a
  warning about the check, not five stale handoffs, and not yours to fix by editing them.
- **A project env read cannot see team-shared variables.** `SESSION_SECRET` and `APP_PASSWORD_HASH`
  are shared ones, so a project read that lacks them proves nothing.
- **The Vercel connector lists write tools. Do not use them** — hand Joel the step.
- **Read the real head SHA before passing `expectedHeadSha`.** An invented one is rejected.
