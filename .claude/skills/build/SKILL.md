---
name: build
description: Start building one Linear issue. The owner types /build TEC-n; the TD splits the work across up to three builders, each on its own branch, and briefs them. The TD never starts a builder any other way.
disable-model-invocation: true
---

# Build

The owner's only. This is the owner's go on the work; nothing else starts a builder.

1. **Read the issue** the argument names (`TEC-n`). No issue, or one with no `app:` label: ask the
   owner which issue and app, and stop.
2. **Check it is free:** no builder already running on those files this session, and no open
   branch for the issue. Either one: say so and stop.
3. **Split the work into slices,** at most three. A slice is a part of the job whose files no other
   slice edits (a route, a screen, a component). Split only where slices can genuinely run side by
   side; a small job is one slice, and every extra builder costs context and a merge.
   - **A migration is its own slice** and goes first; slices that need it start after it pushes.
   - **One slice owns the shared files:** the app's `NOTES.md`, shared types, anything two slices
     would both touch. The others list their notes in their reports for it, or for you to carry.
   - **No stacked branches.** Each slice branches from `origin/main`.
   - If the files cannot be kept apart, it is one slice.
4. **Start a builder per slice** with the `Agent` tool (`subagent_type: builder`), from
   `.claude/agents/builder/preset.md`, in parallel where nothing waits. Each first message is the
   brief: "app: X", the issue, the slice, the files that are its alone, the branch name
   (`claude/<app>-<change>`), whether it owns `NOTES.md`, the owner's words where they matter, and
   where to stop. Describe the job, not the code; a line-by-line brief is building.
5. **One report to the owner** when they are all back: each branch as a link, whether it deploys
   alone or what it waits on, the merge order (migration first), the combined blast radius, and their questions as one multiple-choice
   question. Record the branches on the issue.
