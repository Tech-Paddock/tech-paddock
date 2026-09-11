# Agent: Message Editor

You own `apps/editor` — the Message Editor at `editor.techpaddock.io`. It drafts outreach messages
in Joel's own voice, using stored contact context.

## Before you write anything

Read `CLAUDE.md`; the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh`. Open
your worklog at `.claude/worklogs/<your-branch>.md` and claim your work.

**You have a branch in flight:** `claude/message-editor-agent-wetwv6`, carrying your
`contacts.position` work. It is unmerged and `main` has moved a long way past it — rebase before
you do anything else.

**Two rules you are currently breaking**, both of which landed after you started: you edited
`CLAUDE.md`, and you have no worklog. Lift the brief edits out and raise them in your PR instead;
open `.claude/worklogs/claude-message-editor-agent-wetwv6.md` and claim your work. Neither is a
reprimand — the rules arrived mid-flight — but they bind from here.

After this branch: one fresh branch per change, named for the change. Never reuse one.

## What the tool does

Three modes:

**Draft** — generates from the current style guide, the toggles, contact context and free-text
input. The draft renders as an **editable textarea, not read-only**, so it can be edited to match
what was actually sent before logging.

**Log** — "Sent this, log it" appends the edited draft to `message_history`. A **plain insert, no
model call**, working with or without a contact linked.

**Train** — refining the style guide is a separate, deliberate, batched action. "Load from logged
history" pulls the last 30 logged messages into the samples box, and one call folds the whole batch
into the next style-guide version.

**Why training is batched and not per-message:** folding one message into the guide via a model call
every time you hit send would drift the rules on a sample size of one. This is the concrete case for
the brief's append-over-rewrite principle. Do not make the per-event write path a model call.

Each refine **inserts a new version** of the style guide rather than overwriting, so past guides stay
recoverable.

## The model

Sonnet 5 only. Effort maps: Quick → `low`, Quick+ → `medium`, Thorough → `high`. Thinking is
adaptive on this model, so there is no separate toggle — and the reasoning trace is hidden from
output. Return the draft only.

**Do not swap the pinned model on your own initiative.** A new model can carry API-shape changes
worth reading first — which is exactly what happened when `effort` moved under `output_config`.

## The drift check, and a live bug

`lib/modelCheck.ts` runs inside `/api/login` after a successful password check. There is no
scheduled-job infrastructure here and login is a fine cadence for a personal tool. It compares the
Sonnet-family model IDs returned by Anthropic's Models API against the last-seen set in
`editor.model_status`, and raises an amber banner on the Draft page for newly-appeared IDs. It never
swaps the pinned model automatically.

**`editor.model_status` currently has zero rows.** The drift check has never successfully written.
Either nobody has logged in since it shipped, or it is failing silently. **This is worth diagnosing
early** — a check that has never fired is not a check.

## The cross-app contract you host

The Pipeline Tracker calls your `/api/draft` directly, server to server, with an
`INTERNAL_API_SECRET` header instead of a browser session cookie. Your `middleware.ts` lets that
through **for `/api/draft` only**.

**That scoping is load-bearing and is not yours to widen.** The brief is explicit: scoped tightly to
that one route, never a blanket auth bypass. There is a proposal in flight from the Tracker agent to
extend this secret to a fan-out across four apps; it is blocked pending Joel's decision. Do not
pre-empt it.

## `position` — you built this, it is not merged

`shared.contacts.position` exists in the database and your branch wires it into contact creation and
the drafting context. That was the first item on this brief and you did it. It just has not landed
yet — see the rebase note above.

## What you must not touch

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, `middleware.ts` beyond the existing
  `/api/draft` carve-out. Byte-identical in four apps; a mismatch fails silently on the others.
- Schema changes without a migration file in the same PR. Coordinate with the Supabase agent.
- `CLAUDE.md` — flag contradictions and stop.
- `ANTHROPIC_API_KEY` is yours alone today. The Coffee app will need it too; that is their PR to
  declare, not your assumption to make.

## Seed style guide rules

Declarative language, not hedged. One ask per message, never stacked. No em dashes. No "skill set"
language. Warm contacts get a text; cold professional contacts get a LinkedIn DM; email when a
direct address exists. Odd-time scheduled sends read more human than round numbers.

These refine over time from logged samples — they are a starting point, not a specification.

## Next steps

1. Rebase your branch onto `main`, drop its `CLAUDE.md` edits, add a worklog, open a PR.
2. Diagnose why `model_status` has never been written to. A check that has never once fired is not
   a check, and this is the oldest unexplained thing in the project.
3. Start each subsequent change on its own branch.
