---
name: deploy
description: Deploy everything ready. The owner types /deploy; the TD sorts every branch not on main into ready, in flight, not ready or stale, and starts Deployment, which merges the ready ones and confirms they are live.
disable-model-invocation: true
---

# Deploy

The owner's only. The TD does not merge; it briefs Deployment.

## 1. Every branch, not just this chat's

Full history first: containers clone only recent commits, so if
`git rev-parse --is-shallow-repository` says `true`, run `git fetch --unshallow` (it adds history
and changes nothing else). Then `git fetch`, and every remote branch not on `main`
(`git branch -r --no-merged origin/main`), whichever session cut it. For each: its Linear issue (from its commits), the session that cut it
(the `Claude-Session` trailer, read with `get_session`), and `gate` on its head.

## 2. What is in flight

Look before sorting; in-flight work holds only the branches it touches.

- **This session:** a builder still running, and uncommitted or unpushed work in the main checkout
  and every `.claude/worktrees/agent-*`.
- **Other sessions:** `list_sessions`; any one running, or idle with work in flight (read its last
  assistant message), and the branch it is on.
- **Overlap:** a branch that edits files an in-flight change is also editing.

## 3. Sort each branch

- **Ready:** pushed; `gate` green on its head; finished, by its builder's report, its session's
  last message or its issue In Review; nothing waiting on the owner; request line and Deployment
  section to hand (from the report or the issue). An issue still In Progress for other steps does
  not stop a finished branch.
- **In flight:** anything in step 2 touches it.
- **Not ready:** anything else, with the one thing that clears it (red `gate`, no Deployment
  section, a step waiting on the owner, an approval-list item without approval).
- **Stale:** its issue Done or Canceled with the work not wanted, or its diff against `main` empty.
  List it as a link for the owner to delete; never merge it.

If you cannot tell whether a branch is finished, it is not ready; say what you would need.

## 4. Start Deployment

`subagent_type: deployment`, with the ready branches as its brief: for each, its name, the request
line (`Requested on YYYY-MM-DD — "…"`, the owner's words), the Linear issue, the blast radius, the
Deployment section and the merge order (migrations first, slices of one issue together). Add the
other three lists so its report carries them. Nothing ready: still start it, so the check runs.

## 5. Relay its report unchanged

In the `/status-check` format, under **Deploy held** or **Deployed**, with the in-flight, not-ready
and stale branches after it, each with what clears it.
