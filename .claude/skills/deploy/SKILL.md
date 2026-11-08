---
name: deploy
description: Deploy everything ready. The owner types /deploy; the TD sorts every branch not on main into ready, in flight, not ready or stale, and starts Deployment, which merges the ready ones and confirms they are live.
disable-model-invocation: true
---

# Deploy

The owner's only. The TD does not merge; it briefs Deployment. **Typing `/deploy` is the one
approval** (TEC-237): the prompt hook records it and Deployment starts without a click. The lock in
step 0 is the only check; CLAUDE.md's owner-approval list still holds per branch.

## 0. The lock

One Deployment at a time, across every session. Deployment opens pull requests only while it
merges, so **an open pull request anywhere in the repo means a deploy is in flight.** List them
(`list_pull_requests`, state open) and note the holder: the `Claude-Session` trailer on each one's
head commit, or `list_sessions`. Then sort as below either way; step 4 says what a held lock
changes.

## 1. Every branch, not just this chat's

Full history first: containers clone only recent commits, so if
`git rev-parse --is-shallow-repository` says `true`, run `git fetch --unshallow` (it adds history
and changes nothing else). Then `git fetch`, and every remote branch not on `main`
(`git branch -r --no-merged origin/main`), whichever session cut it. For each: its Linear issue (from its commits), the session that cut it
(the `Claude-Session` trailer, read with `get_session`), and `gate` on its head.

Every ready branch deploys, whichever session cut it (TEC-237, superseding TEC-173). Name the
session that cut each in the brief, so the report says whose work shipped.

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

## 4. Deploy, or hand off to the deploy running

**No lock:** start Deployment (`subagent_type: deployment`) now, with the ready branches as its
brief: for each, its name, the request line (`Requested on YYYY-MM-DD — "…"`, the owner's words),
the Linear issue, the blast radius, the Deployment section and the merge order (migrations first,
slices of one issue together). Add the other three lists so its report carries them. Nothing ready:
still start it, so the check runs.

**Lock held:** do not start Deployment. Ask the holder, TD to TD with `send_message` (a Deployment
helper cannot be messaged across sessions, so its TD speaks for it), to include your ready branches
in its run, with their briefs. Open the message with plain words, never a slash command.

1. **Yes:** the holder hands them to its running Deployment (`SendMessage`), which merges them
   last, and reports each back to you. Nothing starts here, so nothing asks.
2. **Anything but yes** (a no, a condition, a clash, or no answer by a `send_later` check-in at 20
   minutes): ask the holder to explain, then put its reason to the owner as one multiple-choice
   question (such as: deploy here once its Deployment stops, or hold these branches). Act on the
   answer; starting Deployment later still needs no click while the `/deploy` is under 12 hours old.
3. **No holder:** a pull request no session claims (a crashed Deployment) is the owner's to close;
   name it as a link and stop.

**When you hold the lock and another TD asks,** answer yes and fold its branches in if they are
ready and touch nothing your own branches touch; otherwise answer with why. Report each of its
branches back, and message every session waiting on you when your Deployment stops. Order changes
are not the owner's.

## 5. What reaches the owner

Relay Deployment's report, or the holder's report on your branches, in the `/status-check` format
under **Deploy held** or **Deployed**. Tell the owner, in this chat, everything that needs them: a
clash (two runs touching the same files, a merge conflict), a failure, a hold, a revert, or a step
only they can take. A clean merge is one line: shipped, live. Who held the lock and how it was
resolved is one line too; a changed order is not news. If you held the lock, message every session
that asked to hear when your Deployment stopped.
