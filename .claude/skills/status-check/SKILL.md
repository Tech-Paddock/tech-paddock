---
name: status-check
description: Report what is in flight — open branches, uncommitted or unpushed work, items blocking work, hot topics — and whether this chat can be archived. Read-only. The owner types /status-check, /status-check <app> for one app, or /status-check session for this chat alone.
disable-model-invocation: true
---

# Status check

Read-only: no branch, commit, push, pull request or Linear, Vercel or Supabase write.

## Scope

The argument sets the scope.

- **None:** the whole project, as below.
- **An app folder under `apps/`** (`cookbook`, `lando`, …): every section narrowed to that app, plus
  the *App* sections. A branch is the app's when its diff against `main` touches `apps/<app>/`, or
  a migration for its schema; an issue is the app's when it carries `app:<app>`.
- **`session`:** this chat only. What it did and what it left, nothing it did not touch.

Anything else: name the app folders and stop.

## Gather

1. **Open branches:** `git fetch --prune`; every remote branch not on `main`, how far behind, and
   whether a pull request is open.
2. **Uncommitted or unpushed:** `git status` in the main checkout and each
   `.claude/worktrees/agent-*`; running agents (`ListAgents`); sessions (`list_sessions`, mine)
   with work in flight or an unanswered question.
3. **Blocking:** open TEC issues with a ⭐ step or assigned to the owner, and issues Backlog for
   being blocked. **Phone checks:** issues labelled `Phone check`, each with what to look at and a
   link to the app.
4. **Hot topics:** CI and `drift` on `main`; issues In Progress or In Review; anything updated in
   the last 24 hours; any production deployment not `READY`.
5. **This chat:** what archiving it would lose. Blockers: a running subagent; uncommitted or
   unpushed work it made; a pull request it is subscribed to or a check-in it scheduled; a
   question to the owner it is waiting on; a decision or request reached here that is in no
   commit, `NOTES.md` or Linear issue.

**App scope adds:**

6. **High priority:** open `app:<app>` issues at Urgent or High.
7. **Pending migrations:** files under `supabase/migrations/` for the app's schema, on `main` or on
   its branches, whose version `list_migrations` does not show. Name each by its name.
8. **Open Next steps:** every unfinished step across the app's open issues, grouped by who acts.

**Session scope** reads this conversation, not the project: pull requests merged and branches
pushed; Linear issues opened, moved or edited; Supabase or Vercel writes and SQL handed to the
owner, and whether each landed; subagents started and whether they reported; owner steps it is
waiting on. Then item 5.

## Report

Sections in this order; an empty one reads "none". App scope puts the app in the header and adds
its three sections after Hot topics. Session scope replaces the middle sections with **Done here**
and **Waiting**.

```
---
Status · YYYY-MM-DD HH:MM

Blocking
- TEC-n ⭐ Owner: what is needed

Phone checks
- TEC-n: what to look at, on the app's link

Uncommitted / unpushed
- who (app), where: what

Open branches
- branch: n behind main, pull request or none

Hot topics
- main CI: … · drift: … · TEC-n in progress (title)

Archive this chat
- Archive: clear  |  Archive: not clear — what is lost, and what clears it
```

```
---
Status · cookbook · YYYY-MM-DD HH:MM

Blocking · Uncommitted / unpushed · Open branches · Hot topics  (as above, this app only)

High priority
- TEC-n (Urgent|High): title, status

Pending migrations
- migration_name: on main | on branch, not applied

Open Next steps
- Owner: TEC-n step n — what
- TD: …  ·  Builder: …  ·  Deployment: …

Archive this chat
- …
```

```
---
Status · session · YYYY-MM-DD HH:MM

Done here
- merged #n (TEC-n) · pushed branch · filed TEC-n · ran SQL: what, confirmed

Waiting
- TEC-n ⭐ Owner: what  ·  subagent: what, still running

Archive this chat
- …
```

A decision that lives only in this chat is fixed by writing it down (a Linear issue or
`NOTES.md`), not by keeping the chat. Issues, pull requests and apps are links.
