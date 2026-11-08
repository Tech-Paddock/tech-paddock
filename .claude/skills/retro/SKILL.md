---
name: retro
description: A short look back at the work since the last retro — what shipped, what is still waiting, what went well, what didn't, and one change to carry forward. The owner types /retro; it never runs on a schedule.
disable-model-invocation: true
---

# Retro

The owner's only, on demand (owner, 2026-11-07: "Only when I type /retro"). Read-only until the
owner approves the one change; then that change is the only write.

## Gather

1. **The window:** since the newest entry in `.claude/DECISIONS.md` tagged `(retro YYYY-MM-DD)`,
   or the last 7 days if there is none or it is older.
2. **Shipped:** TEC issues completed in the window (Linear, `completedAt`), each with its pull
   request. Group them by app.
3. **Still waiting:** open owner tasks, and merged branches still on the remote.
4. **What happened:** this chat, plus the issues' comments and Deployment reports in the window.
   Look for holds, reverts, red CI, rework, and owner corrections ("a little more than I wanted",
   "my bad").

## Report

```
---
Retro · <first day> to <last day>

Shipped
- <app>: TEC-n, what changed, linked · …

Still waiting on you
- …

Went well: one line.
Didn't: one line: what went wrong and why, not who.
One change: one rule a future session must follow, worded as the DECISIONS.md entry it would become.
```

- **Pick one change, the one that would have saved the most rework.** Skip the change when
  nothing went wrong, and say so.
- **Never a change on the owner-approval list** without saying it needs the owner, for example
  CLAUDE.md, the hooks or `.claude/settings.json`.

## On the owner's OK

1. **Record the change** as one entry in `.claude/DECISIONS.md`, under the section it belongs
   to: Settled, Mistakes or Traps. Tag it `(retro YYYY-MM-DD)`, which also marks where the next
   retro's window starts.
2. **Commit** it on the TD's docs branch for this chat. It deploys on the next `/deploy`.
3. **An edited change:** record the owner's wording, not yours.
4. **No OK:** record nothing.
