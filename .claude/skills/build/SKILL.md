---
name: build
description: Build what this chat has readied, or one issue. The owner types /build for every issue this chat has readied, or /build TEC-n for that one; the TD shows the plan, then briefs the builders. The TD never starts a builder any other way.
disable-model-invocation: true
---

# Build

The owner's only. This is the owner's go on the work; nothing else starts a builder. The guard still
asks the owner as each builder starts, so the plan in step 2 is what those approvals rest on.

1. **What to build.**
   - **`/build TEC-n`:** that issue. No such issue, or one with no `app:` label: ask the owner
     which issue and app, and stop.
   - **`/build` alone:** every issue this chat filed or readied that is Todo and waits only on a
     build, like `/status-check` with no argument covering everything. None: say so and stop.
2. **Show the plan, then start.** One short list: each issue in order, what it changes, who builds
   it, and what waits on what (an issue's "Order" section, a migration first, and one builder at a
   time in an app whose issues share files or `NOTES.md`). The owner's `/build` is the go; they stop
   it by saying so.
3. **Check each is free:** no builder already running on its files this session, and no open branch
   for the issue. Either one: leave that issue out and say why.
4. **How the work splits is yours.** Most issues are one builder. Split one only where its parts
   edit different files and can genuinely run side by side; every extra builder costs context and a
   merge.
   - **A migration is its own slice** and goes first; slices that need it start after it pushes.
   - **One slice owns the shared files:** the app's `NOTES.md`, shared types, anything two slices
     would both touch. The others list their notes in their reports for it, or for you to carry.
   - **No stacked branches.** Each slice branches from `origin/main`.
5. **Start a builder per slice** with the `Agent` tool (`subagent_type: builder`), from
   `.claude/agents/builder/preset.md`, in parallel where nothing waits. Each first message is the
   brief: "app: X", the issue, the slice, the files that are its alone, the branch name
   (`claude/<app>-<change>`), whether it owns `NOTES.md`, the owner's words where they matter, and
   where to stop. Describe the job, not the code; a line-by-line brief is building.
6. **One report to the owner** when they are all back: each branch as a link, whether it deploys
   alone or what it waits on, the merge order (migration first), the combined blast radius, and
   their questions as one multiple-choice question. Record the branches on each issue.
