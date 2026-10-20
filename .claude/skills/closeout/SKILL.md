---
name: closeout
description: Finish a session so it is safe to archive — nothing left only in the conversation, and nothing committed to a branch nobody agreed. The owner types /closeout, or an agent runs it when its work is done.
---

# Closeout

End with one line: **"Safe to archive once `<branch>` is on `main`"** or **"Safe to archive now."**

## 1. Find what is not saved

`git status`, `git stash list`, unpushed commits (`git log --branches --not --remotes`), and any
`.claude/worktrees/agent-*` with changes. On the TD, close out a running builder first; a container
restart kills it and its unpushed work.

## 2. Never assume where work lands

If the work is unfinished or its branch is not agreed or unclear, stop and ask the owner a
multiple-choice question before committing. The builder puts the question in its report and the TD
asks it. Never `main`, never the harness-named session branch.

## 3. Finished work on its agreed branch

- Commit and push.
- `NOTES.md` (the app's or the TD's) describes the state after merge.
- `node scripts/drift-check.mjs` has 0 failures.
- Every open item is in Linear: an `owner:` label (and `app:` where one applies), Next steps, a ⭐
  on each step waiting on the owner, and the owner assigned while one does.

## 4. The report

What is now true; what you verified and what you could not; the blast radius (apps, shared files);
the Deployment section (on merge, manual steps in order, how to verify, what breaks if skipped);
any migration by name and shape (additive or destructive).

Last line: **"Safe to archive once `<branch>` is on `main`"** or **"Safe to archive now."**
