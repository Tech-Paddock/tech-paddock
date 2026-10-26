---
name: build
description: Start the builder on one Linear issue. The owner types /build TEC-n; the TD writes the brief and starts the builder. The TD never starts the builder any other way.
disable-model-invocation: true
---

# Build

The owner's only. This is the owner's go on the work; nothing else starts the builder.

1. **Read the issue** the argument names (`TEC-n`). No issue, or one with no `app:` label: ask the
   owner which issue and app, and stop.
2. **Check it is free:** no builder already running in that app folder this session, and no open
   branch for the issue. Either one: say so and stop.
3. **Start the builder** with the `Agent` tool (`subagent_type: builder`), from
   `.claude/agents/builder/preset.md`. The first message is the brief: "app: X", the issue, the
   owner's words where they matter, and where to stop. Describe the job, not the code; a
   line-by-line brief is building.
4. **Relay its report** to the owner when it returns, with its branch as a link and its questions
   as a multiple-choice question.
