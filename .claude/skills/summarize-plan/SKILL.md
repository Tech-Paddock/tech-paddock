---
name: summarize-plan
description: Summarize the work ahead — every build and deploy in order, what each waits on and its blast radius — ending with the exact /execute-plan command that runs it. The owner types /summarize-plan or /summarize-plan <app>; an agent may run it too.
---

# Summarize plan

Read-only, but for one file: no branch, commit, push, pull request, or Linear, Vercel or Supabase
write. The argument sets the scope: none is every app; an app folder under `apps/` narrows it.

## Gather

1. **Ready to build:** open TEC issues in scope that are Todo and wait only on a build, each with
   its "Order" section and any migration it adds.
2. **Ready to deploy:** pushed branches not on `main`, sorted as `/deploy` sorts them. Another
   session's branch is listed, but a plan takes it only if the owner says so (TEC-173).
3. **In flight:** a builder or Deployment running in this session, and other sessions at work in
   scope. A step they touch waits for them.

## Order

Migrations first. Each issue's "Order" section holds. One builder at a time in an app whose issues
share files or `NOTES.md`. Each build is followed by its deploy before anything that needs it.

## Report

```
---
Plan · <scope> · YYYY-MM-DD HH:MM

1. Build TEC-n (app): what changes. Migration: name | none. Waits on: …
   Blast radius: apps, shared files, schema.
2. Deploy TEC-n: what goes live, what it waits on.
…

Not in this plan
- TEC-n: why (waits on the owner, parked, another session's)

Run it: `/execute-plan <scope>`
```

**The command** names the plan exactly: `/execute-plan <app>` when the plan is every ready issue of
one app, otherwise `/execute-plan TEC-a TEC-b …` in plan order. Nothing ready: say so, and give no
command.

**Record it** in `.claude/state/plan.json`, overwriting any earlier one:
`{"command": "/execute-plan lando", "issues": ["TEC-176", "TEC-177"], "at": "<ISO time>"}`. This is
how `/execute-plan` knows the owner typed the plan shown here. The prompt hook blocks any other
command and answers with this one. `.claude/state/` is gitignored.

End with the `### Ready to Archive` or `### Do Not Archive` heading and its reasons.
