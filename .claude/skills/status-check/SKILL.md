---
name: status-check
description: Report what is in flight — open branches, uncommitted or unpushed work, items blocking work, and hot topics. Read-only. The owner types /status-check.
disable-model-invocation: true
---

# Status check

Read-only: no branch, commit, push, pull request or Linear, Vercel or Supabase write.

## Gather

1. **Open branches:** `git fetch --prune`; every remote branch not on `main`, how far behind, and
   whether a pull request is open.
2. **Uncommitted or unpushed:** `git status` in the main checkout and each
   `.claude/worktrees/agent-*`; running agents (`ListAgents`); sessions (`list_sessions`, mine)
   with work in flight or an unanswered question.
3. **Blocking:** open TEC issues with a ⭐ step or assigned to the owner, and issues Backlog for
   being blocked.
4. **Hot topics:** CI and `drift` on `main`; issues In Progress or In Review; anything updated in
   the last 24 hours; any production deployment not `READY`.

## Report

Sections in this order; an empty one reads "none".

```
---
Status · YYYY-MM-DD HH:MM

Blocking
- TEC-n ⭐ Owner: what is needed

Uncommitted / unpushed
- who (app), where: what

Open branches
- branch: n behind main, pull request or none

Hot topics
- main CI: … · drift: … · TEC-n in progress (title)
```
