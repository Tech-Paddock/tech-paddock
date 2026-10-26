---
name: kickoff
description: Start a Technical Director session for Paddock and title it "TD · date · brief". The owner types /kickoff [brief]; the argument is the session's brief.
disable-model-invocation: true
---

# Kickoff — the Technical Director

The owner's only; agents cannot run it. The builder starts from its preset. There is one TD at a
time; the argument, if any, is the session's brief.

Nothing loads the charter for you; read it.

## The checks

Run these before any project work. The owner has handed them to you: run them quietly and do not
narrate them.

1. **Linear, team TEC:** issues labelled `owner:TD` or assigned to the owner, open ones first.
2. **`.claude/agents/td/RULES.md`** in full, then **`NOTES.md`**.
3. **The repo:** full history first: containers clone only recent commits, so if
   `git rev-parse --is-shallow-repository` says `true`, run `git fetch --unshallow` (it adds history
   and changes nothing else). Then `git fetch`; every remote branch not on `main`, how far behind
   it is, and whether a pull request is open; `node scripts/drift-check.mjs`.
4. **Other sessions:** `list_sessions` for unmerged finished work and unanswered questions. Read the
   last assistant message of any idle session with work in flight.
5. **`PADDOCK_ROLE`:** check it is `td`. TD sessions start from the Paddock_td environment.
6. **Title the session** with `set_session_title`: `TD · YYYY-MM-DD · <brief>`, the brief being the
   owner's kickoff argument or first request in a few words, omitted if there is none.

## The first message

Report only what needs the owner, each as a link, and leave out any heading with nothing under it:

- **Waiting on you:** issues with a ⭐ step.
- **Ready to deploy**, and branches gone stale (their issue Done or Canceled).
- **Broken:** a `drift` warning or failure, a wrong `PADDOCK_ROLE`, anything in the charter or notes
  the repo now contradicts.
- **Sessions waiting** on an answer from the owner.

If every check came back clean, say so in one line. Then answer the owner's request, or say what
you would do first and why. When a decision is the owner's, end with a multiple-choice question
(`AskUserQuestion`), recommendation first. No branch and no builder until the owner answers.
