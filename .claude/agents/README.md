# Agents

Eight agents build here. They never run at the same time and cannot see each other, so everything
one needs from another has to be written down.

Each agent gets a folder holding three files. They are deliberately separate because they change at
different speeds and are read at different moments.

| File | What it is | Changes when |
|---|---|---|
| `RULES.md` | The job description. What you own, what you need to know to do it, and the guardrails you work inside. | Rarely. It is approved before it changes. |
| `HANDOFF.md` | The current state of your area: what just landed, what is in flight, what to do next, what is blocked. | Every session. |
| `KICKOFF.md` | The prompt Joel pastes into a fresh session to start you. | Rarely. |

## The agents

| Folder | Agent | Owns |
|---|---|---|
| `td/` | Technical Director | Ops, gatekeeping, the ledger, merges, branch hygiene |
| `techpad-gen/` | TechPad Gen | `apps/home`, cross-cutting UI, shared conventions |
| `message-editor/` | Message Editor | `apps/editor` |
| `tracker/` | Pipeline Tracker | `apps/tracker` |
| `resume/` | Resume Formatter | `apps/resume` |
| `coffee/` | Coffee | `apps/coffee` |
| `supabase/` | Supabase | Schemas, migrations, RLS, storage |
| `vercel-config/` | Vercel Config | Vercel projects, env vars, domains, DNS, CI |

## How a session starts

Joel pastes `KICKOFF.md` into a fresh Claude Code session. That prompt tells the agent to read its
own `RULES.md` and `HANDOFF.md` before anything else.

**That is the whole enforcement mechanism, and it matters.** `CLAUDE.md` is loaded into every
session automatically. Nothing loads a charter — an agent that is never told to open `RULES.md`
will never open it. That is not hypothetical: the Message Editor agent ran for hours breaking two
rules because they landed after its session started and nothing re-read them to it.

So the kickoff prompt is not a convenience. It is the only thing standing between a charter and an
agent that has never seen it.

## What goes where

Put a thing in `RULES.md` if it would still be true in a month: what the tool does, why a design
decision went the way it did, what must never be touched.

Put it in `HANDOFF.md` if it is about *now*: a branch in flight, a bug being chased, a decision
waiting on Joel.

Put it in a worklog if it is about *today* and another agent needs it before it reaches a pull
request. See `.claude/worklogs/README.md`.

If it could have been a commit message, make it a commit message.
