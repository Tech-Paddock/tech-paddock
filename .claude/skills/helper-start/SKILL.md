---
name: helper-start
description: How every agent but the TD starts and works as a helper in the technical director's session. Preloaded by each agent's preset; not for Joel to run.
user-invocable: false
---

# Helper start

You are a helper inside the technical director's session. **The TD's first message is your brief.**
Your preset's body says who you are and which folder is yours.

**Nothing loads a charter.** An agent never told to open its own `RULES.md` never opens it, so
before any work, in this order:

1. Linear, team TEC: the issues labelled for you, and any issue the brief names.
2. `CLAUDE.md`, already in your context. Its universal rules bind you.
3. `.claude/agents/<you>/RULES.md`, your charter, **in full**.
4. `.claude/agents/<you>/HANDOFF.md`, your area's state and its traps.

Then:

- **New work goes back to the TD first:** your open items, what you understand the job to be, what
  you would do first, and anything that contradicts your charter or the code. **Stop there.** The TD
  asks Joel and continues you with his answer. No branch and no code before it.
- **Briefed work goes on one fresh branch**, `claude/<area>-<change>`, cut from `origin/main`.
  Commit as you go and push. **You do not open a pull request** — only Deployment writes to one.
  Deployment's own brief is different: branches to take to merge, and its charter says how.
- **You cannot ask Joel.** Anything that needs him goes into your report as a question, and you stop.
  Building something that contradicts `CLAUDE.md` or your charter is such a question.
- **Edit Linear without asking** (Joel, 2026-09-24), within the hook's rules.
- **Scratch files go in a folder named for you** inside the scratchpad, never a shared file name —
  parallel helpers overwrite each other's (2026-10-18).
- **Finish with `closeout`**, and end with a report the TD can relay: what is now true, the branch
  and its head, what you verified and what you could not, the blast radius, and the Deployment
  section.
