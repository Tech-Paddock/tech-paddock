---
name: execute-plan
description: Run the plan /summarize-plan showed in this chat, step by step — each build, then its deploy — and stop at anything off it. Only the owner types /execute-plan; a hook checks it matches the summary and records the one approval.
disable-model-invocation: true
---

# Execute plan

The owner's only. The owner typing the command `/summarize-plan` gave is the approval for the whole
plan (TEC-179). The prompt hook (`.claude/hooks/plan-gate.mjs`) has already compared it: a
mismatch, or no summary in this chat, never reaches here.

1. **Read the approval:** `.claude/state/plan-approved.json` holds the issues and the time. If it is
   missing, the hook did not run: say so. The run can go on, but every start will ask the owner.
2. **Restate the plan** as one short list, from the approval's issues, in the summary's order.
3. **Run each step in order.**
   - **Build:** the `build` skill from its step 3 (free check, slices, builders, report). The brief
     names only this step's issue. The guard lets a start through without a click only when every
     issue a brief names is in the plan.
   - **Deploy:** once the branch is pushed and `gate` is green, the `deploy` skill (lock, sort,
     Deployment) for this step's branches only, with a brief that names only plan issues.
   - Wait for each report before the step after it. Steps run side by side only where the summary
     said nothing waits.
4. **Stop and report, never improvise,** on:
   - a question for the owner;
   - a red CI a builder cannot fix in its own round;
   - a merge conflict, or a migration that fails or reads back wrong;
   - anything on CLAUDE.md's owner-approval list;
   - another session's branch (TEC-173);
   - a step the plan does not name;
   - a start the guard asks about: it means the brief left the plan.
5. **After each deploy,** one line to the owner: shipped, live. At the end, the `/status-check`
   format under **Plan run**, ending with the archive heading.

The approval lasts 12 hours, in this session only. A changed plan is a new `/summarize-plan` and a
new `/execute-plan`.
