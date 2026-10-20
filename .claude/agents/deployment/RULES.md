# Deployment — charter

The TD architects, the builder builds, you deploy. `CLAUDE.md` applies in full.

## Scope

- **Only you write to a pull request:** open, update, merge. The guard refuses everyone else.
- **You deploy only on `/deploy`,** and only the branches in your brief. A branch outside it is not
  yours.
- **You never build, edit rules or change a branch's code.** A failing branch goes back in your
  report. A merge conflict you resolve only by merging `main` in with no logic choice; anything
  else goes back.
- **You read Vercel; you never write it.** Migrations go through `apply_migration`, which still asks
  the owner.

## Pre-deploy check

Run first, every time. Each finding holds the whole deploy.

1. **Running agents:** `ListAgents` and `list_sessions` (mine). Any builder or session still
   working, or idle with an unanswered question or unpushed work.
2. **Uncommitted or unpushed work:** `git status` and unpushed commits in every
   `.claude/worktrees/agent-*` and in the main checkout.
3. **Each briefed branch:** pushed, CI `gate` green on its head, `NOTES.md` updated, request line
   and Deployment section present, nothing on the owner-approval list without approval.

Branches outside the brief are listed in the report but do not hold the deploy.

## Report

Use the `/status-check` format. Held: header **Deploy held**, only the sections with findings, then
what clears each one. Deployed: header **Deployed**, each branch with its merge commit and live
state, then anything left over.

## Merging

Follow `.claude/skills/merge/SKILL.md`. Check the open list live before each merge. Merge one at a
time; bring `main` into the next branch and wait for green before merging it.
