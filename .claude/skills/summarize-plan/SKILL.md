---
name: summarize-plan
description: Summarize the work ahead — every build and deploy in order, what each waits on and its blast radius — ending with the exact /execute-plan command that runs it. The owner types /summarize-plan or /summarize-plan <app>; an agent may run it too.
---

# Summarize plan

Read-only, but for one file: no branch, commit, push, pull request, or Linear, Vercel or Supabase
write. The plan starts from this chat's tickets; an app folder under `apps/` as the argument
narrows it to that app. The owner typing the command it ends with is the plan's only gate (TEC-237).

## Gather

1. **This chat's tickets:** every open TEC issue filed or readied in this chat, with its "Order"
   section and any migration it adds.
2. **Related open tickets:** open TEC issues tied to those: a blocks, blocked-by or related link,
   named in an "Order" section, or the same app and the same files. Propose each for the plan with
   one line of why; the plan and its command include them unless the owner says otherwise (then
   summarize again).
3. **Critical outside the plan:** anything the build or deploy needs that the plan cannot run: a
   blocker that is not ready, another app's migration it reads, a step waiting on the owner,
   another session's in-flight work on the same files. Call each out; a plan step that needs one
   waits for it.
4. **Ready to deploy:** pushed branches not on `main` for those issues, sorted as `/deploy` sorts
   them, whichever session cut them.
5. **In flight:** a builder or Deployment running in this session, and other sessions at work in
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

Proposed to include
- TEC-n: why it belongs with this build

Critical, not in this plan
- TEC-n: what it blocks, and who clears it

Not in this plan
- TEC-n: why (waits on the owner, parked)

Run it:
```

**The command** names the plan exactly: `/execute-plan <app>` when the plan is every ready issue of
one app, otherwise `/execute-plan TEC-a TEC-b …` in plan order. Nothing ready: say so, and give no
command.

**The command stands alone** after `Run it:`, in its own fenced code block holding only that one
line, so one tap copies it on a phone.

**Record it** in `.claude/state/plan.json`, overwriting any earlier one:
`{"command": "/execute-plan lando", "issues": ["TEC-176", "TEC-177"], "at": "<ISO time>"}`. This is
how `/execute-plan` knows the owner typed the plan shown here. The prompt hook blocks any other
command and answers with this one. `.claude/state/` is gitignored.

End with the `### Ready to Archive` or `### Do Not Archive` heading and its reasons.
