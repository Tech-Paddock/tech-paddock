---
name: deploy
description: Deploy everything ready. The owner types /deploy; the TD sorts every branch not on main into ready, in flight, not ready or stale, and starts Deployment, which merges the ready ones and confirms they are live.
disable-model-invocation: true
---

# Deploy

The owner's only. The TD does not merge; it briefs Deployment.

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

A branch is **this session's** when its commits beyond `main` carry this session's
`Claude-Session` trailer, as the TD's and its builders' do; a merge of `main` into it decides
nothing. Every branch is still sorted; only this session's deploy without asking (TEC-173).

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

**Another session's ready branch waits for the owner** (TEC-173). Before step 4, ask once, listing
each as a link with the session that cut it and its issue. Only the ones the owner picks join the
brief; the rest are listed as held, "not this session's".

## 4. Start Deployment now

**The owner's `/deploy` is the green light, and its approval click lands here, now,** while they
are in this chat. So start Deployment (`subagent_type: deployment`) straight away, lock or not,
with the ready branches as its brief: for each, its name, the request line
(`Requested on YYYY-MM-DD — "…"`, the owner's words), the Linear issue, the blast radius, the
Deployment section and the merge order (migrations first, slices of one issue together). Add the
other three lists so its report carries them. Nothing ready: still start it, so the check runs.

**Lock held:** tell Deployment so in its brief; it runs its pre-deploy check, reports held, and
stops without opening anything. Then, TD to TD with `send_message` (a Deployment helper cannot be
messaged across sessions, so its TD speaks for it):

1. **Offer the holder your ready branches** with their briefs, and ask it to fold them into its run
   or to message you when its Deployment stops.
2. **The holder folds them in** if they are ready and touch nothing its own branches touch: it
   `SendMessage`s them to its running Deployment, which merges them last. No new approval: the
   owner's `/deploy` in your chat already covers them (each is that chat's own or one the owner
   picked there), and order changes are not the owner's.
   Otherwise it replies with why. Either way it reports each of your branches back to you, and
   messages every session waiting on it when its Deployment stops.
3. **Not folded in:** when the holder says it has stopped, or a `send_later` check-in at 20 minutes
   finds no pull request open, **resume your own Deployment with `SendMessage`.** Resuming a
   helper starts nothing new, so the owner is not asked again.
4. **No holder:** a pull request no session claims (a crashed Deployment) is the owner's to close;
   name it as a link and stop.

## 5. What reaches the owner

Relay Deployment's report, or the holder's report on your branches, in the `/status-check` format
under **Deploy held** or **Deployed**. Tell the owner, in this chat, everything that needs them: a
clash (two runs touching the same files, a merge conflict), a failure, a hold, a revert, or a step
only they can take. A clean merge is one line: shipped, live. Who held the lock and how it was
resolved is one line too; a changed order is not news. If you held the lock, message every session
that asked to hear when your Deployment stopped.
