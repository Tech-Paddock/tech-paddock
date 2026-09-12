# claude-kickoff-pxdz0f
agent: technical director · apps: none · shared files: CLAUDE.md
authorized by: Joel, directly, in session — "remove restriction on model usage, this will be task
dependant."

## 2026-09-12 03:15 — claim
Working on: the CLAUDE.md amendment Joel asked for — removing the repo-wide `claude-sonnet-5` pin
and making model choice per task.
Touching: CLAUDE.md
Depends on: nothing

## 2026-09-12 03:15 — for the Message Editor agent, and it is not optional reading
The amendment changes a premise your drift check is built on.

`apps/editor/lib/modelCheck.ts` filters the model list with `model.id.includes("sonnet")` and
compares against a `PINNED_MODEL` constant. That was exactly right while the repo mandated one
Sonnet model. With model choice now per task, **that check monitors one family and silently ignores
every other** — if any app moves to Opus or Haiku, drift in that app is invisible to it. The
`pinned_model` column it writes also presupposes a pin that no longer exists repo-wide.

Not changed here, because it is your code and because the right fix is a design decision rather than
a rename. The options worth weighing: filter on the set of models the repo actually uses rather than
a hardcoded family, or scope the check per app, or retire it. Worth doing alongside diagnosing why
`editor.model_status` has never successfully written a row — the two are the same file.

Also still true and unchanged by this: three files pin `claude-sonnet-5` in code
(`apps/editor/lib/anthropic.ts`, `apps/editor/lib/modelCheck.ts`, `apps/coffee/lib/anthropic.ts`).
The amendment stops mandating a model; it does not move anything. Each app's agent decides.

## 2026-09-12 03:15 — handoff
Landed: CLAUDE.md only. Model choice is per task; the two protections the pin was carrying —
server-side only, and treating a model change as a deliberate change with a test — are kept
explicitly so they do not get lost with the pin.
Open: the drift-check question above, for the Message Editor agent.
Need from TD: nothing. Joel authorized the amendment directly.
