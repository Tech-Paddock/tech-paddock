---
name: closeout
description: Finish a session so it is safe to archive — nothing left only in the conversation, and nothing committed to a branch nobody agreed. Joel types /closeout, or an agent runs it when its work is done.
---

# Closeout

The goal is one sentence at the end: **"Safe to archive once `<branch>` is on `main`"**, or **"Safe
to archive now."** `CLAUDE.md` says what must be true — *leave nothing only in the conversation* —
and this is the checklist.

## 1. Find what is not saved

`git status`, `git stash list`, unpushed commits on every local branch (`git log --branches --not
--remotes`), and any `.claude/worktrees/agent-*` with changes. On the TD, **close out every running
helper first** — a container restart kills them and takes their unpushed work.

## 2. Never assume where work lands

Joel's rule. If the work is **unfinished**, has **no agreed branch**, or the branch is **unclear**:
stop and ask Joel a multiple-choice question before committing anything. A helper puts the question
in its report and the TD asks it. **Never `main`, and never the harness-named session branch.**

## 3. Finished work on its agreed branch

- Commit and push.
- **`HANDOFF.md` is the state after merge**, never the branch as in flight, within its 80-line cap.
- `node scripts/drift-check.mjs` has **0 failures**.
- **Every open item is in Linear**: `owner:` and `agent:` labels, a Next steps section, a ⭐ on each
  step that waits on Joel, and Joel assigned while one does.

## 4. The report

What is now true; what you verified and what you could not; the blast radius (apps and shared
files); the **four-part Deployment section** — what happens on merge, what a human must do and in
what order, how to verify it is live, what breaks if skipped — and **any migration by name, with
its shape** (additive or destructive).

Last line: **"Safe to archive once `<branch>` is on `main`"**, or **"Safe to archive now."**
