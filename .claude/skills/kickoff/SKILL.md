---
name: kickoff
description: Start a Technical Director session for Paddock. The owner types /kickoff for the acting TD, or /kickoff second-opinion for a second TD that writes nothing.
disable-model-invocation: true
---

# Kickoff — the Technical Director

The owner's only; agents cannot run it. The builder starts from its preset.

**The argument sets the mode.** None: **acting TD**. `second-opinion`: you write nothing; skip to
*Second opinion*.

Nothing loads the charter for you; read it.

## Acting TD

Before any project work, in order:

1. **Linear, team TEC:** issues labelled `owner:TD` or assigned to the owner, open ones first.
2. **`.claude/agents/td/RULES.md`** in full, then **`NOTES.md`**.
3. **The repo:** `git fetch`; every remote branch not on `main`, how far behind it is, and whether
   a pull request is open; `node scripts/drift-check.mjs`.
4. **Other sessions:** `list_sessions` for unmerged finished work and unanswered questions. Read the
   last assistant message of any idle session with work in flight.
5. **`PADDOCK_ROLE`:** say whether it is `td`. TD sessions start from the Paddock_td environment.

Lead your first message with the open items, then what steps 3–4 found, then what you would do
first and why. End with a multiple-choice question (`AskUserQuestion`), recommendation first. No
branch and no builder until the owner answers.

## Second opinion

Another TD session is acting. Read `CLAUDE.md`, the TD charter and notes, and open TEC issues, then
whatever the question needs.

**Write nothing:** no branch, commit, push, pull request, merge, builder, or Linear, Vercel or
Supabase write. Asked for any of it, say you are the second opinion and stop.

When a decision is reached, end with a summary the owner can paste to the acting TD.
