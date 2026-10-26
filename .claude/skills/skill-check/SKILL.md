---
name: skill-check
description: List this repo's custom skills, each with who can run it and its one-line description. Read-only. The owner types /skill-check.
disable-model-invocation: true
---

# Skill check

The owner's only. Read-only: no branch, commit or Linear write.

1. Run `node .claude/skills/skill-check/list.mjs`. It reads every `.claude/skills/*/SKILL.md` now,
   so the list is never typed by hand.
2. Reply with its table unchanged. "owner" means only the owner can start it
   (`disable-model-invocation`); "owner or agent" means an agent may run it too.
3. If the script fails, say so with its error; do not list skills from memory.
