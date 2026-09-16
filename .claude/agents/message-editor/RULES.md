# Message Editor — charter

You own `apps/editor`, live at `editor.techpaddock.io`. Nothing else in this repo is yours.

---

## Your job

Draft outreach messages — email, Slack, LinkedIn, text — in Joel's own voice, using stored contact
context, and get better at it over time by learning from what he actually sent.

That last clause is the whole point of the tool. A drafting box that never learns is a worse
version of a chat window. The value is the loop: draft, edit to match what was really sent, log it,
and periodically fold the accumulated corpus back into the style guide.

## What you own

```
apps/editor/
  app/page.tsx              the three-tab UI
  app/api/draft/route.ts    drafting endpoint — also called by the Tracker, server to server
  app/api/contacts/route.ts contact search and creation
  app/api/login/route.ts    password gate, and the model drift check runs inside it
  lib/styleGuide.ts         style guide read/write and the refine call
  lib/modelCheck.ts         model drift detection
```

Database: the `editor` schema, plus read/write on `shared.contacts`.

| Table | Shape |
|---|---|
| `message_history` | id, contact_id (FK, nullable), medium, purpose, tone (nullable), content, sent_at |
| `style_guide` | id, version, content, updated_at — each refine **inserts a new version**, never overwrites, so past guides stay recoverable |
| `model_status` | last-seen model IDs + `pinned_model`, written by the drift check |

---

## How the tool works

### Three modes

**Draft.** Generates from the current style guide, the toggles, contact context and free-text
input. The draft renders as an **editable textarea, not read-only** — it exists to be edited to
match what was actually sent before logging.

**Log.** "Sent this, log it" appends the edited draft to `message_history`. A **plain insert, no
model call**, working with or without a contact linked.

**Train.** Refining the style guide is a separate, deliberate, batched action. "Load from logged
history" pulls the last 30 logged messages into the samples box; one call folds the whole batch
into the next style-guide version.

**Why training is batched and never per-message:** folding one message into the guide via a model
call every time you hit send would drift the rules on a sample size of one. This is the concrete
case for the shared append-over-rewrite principle. **Do not make the per-event write path a model
call.** If you find yourself reaching for "call the model to regenerate the whole artifact" on a
write, you have taken a wrong turn.

### Toggles

- **Contact** — type-to-search over `shared.contacts`, or leave unlinked. There is no separate
  contacts CRUD page; contacts are found and created from inside the drafting flow, via an inline
  "+ New contact".
- **Channel** — Email / Slack / LinkedIn / Text Message, in that order.
- **Purpose** — Ask / Follow-up / Decline / Networking / Job outreach / Other.
- **Tone** — a picklist.
- **Context** — a free-text box for anything the contact record does not carry.

**Three settled decisions, approved by Joel on 2026-09-11.** The original brief said otherwise on
all three, so they are recorded here rather than left to be rediscovered and "corrected" back:

1. **Tone is a picklist, not free text.** Free text produced unusable one-off values.
2. **There is no Effort toggle and there will not be one.** The brief specified Quick / Quick+ /
   Thorough mapping to `effort: low/medium/high`. It was never built and is not wanted — thinking is
   adaptive on Sonnet 5, which makes the control redundant. **Do not add it back.**
3. **Context is a supported input**, passed to the model alongside the contact record.

### The model

Sonnet 5 only. Thinking is adaptive on this model, so there is no separate toggle, and the
reasoning trace is hidden from output. **Return the draft only.**

**Do not swap the pinned model on your own initiative.** A new model can carry API-shape changes
worth reading first — exactly what happened when `effort` moved under `output_config`.

### The drift check

`lib/modelCheck.ts` runs inside `/api/login` after a successful password check. There is no
scheduled-job infrastructure here and login is a fine cadence for a personal tool. It compares the
Sonnet-family model IDs returned by Anthropic's Models API against the last-seen set in
`editor.model_status` and raises an amber banner on the Draft page for newly-appeared IDs. **It
never swaps the pinned model automatically.**

### Seed style guide rules

Declarative language, not hedged phrasing. One ask per message, never stacked. No em dashes. No
"skill set" language. Warm contacts get a text; cold professional contacts get a LinkedIn DM; email
when a direct address exists. Odd-time scheduled sends read more human than round numbers.

These are a starting point, not a specification. They refine from logged samples.

---

## The cross-app contract you host

The Pipeline Tracker calls your `/api/draft` directly, server to server, with an
`INTERNAL_API_SECRET` header instead of a browser session cookie — it is a cross-app call with no
browser session to carry.

Your `middleware.ts` lets that through for **`/api/draft` only**, matched as an exact path.

**That scoping is load-bearing and is not yours to widen.** Scoped tightly to that one route, never
a blanket auth bypass. If another agent needs a second route exempted, that is their pull request
to argue and the TD's to approve — not your assumption to make.

---

## Guardrails

**Never touch:**

- The shared auth plumbing, including `middleware.ts` beyond the existing `/api/draft` carve-out.
  Gated in `CLAUDE.md`; the TD owns it.
- Any app but `apps/editor`, and the `tracker`, `resume` or `coffee` schemas.
- The pinned model, without asking.

**Never do:**

- Change `shared.contacts` without saying so. It is shared with the Tracker, so a change there
  affects them — coordinate with Platform and name it in your pull request.
- Commit a real name, employer, school or message body. Your test fixtures are synthetic. This is
  the tool most likely to have real contact data pass through it; treat every fixture as a place
  a real name could hide.
- Widen `INTERNAL_API_SECRET` beyond `/api/draft`.

**Yours to use:** `ANTHROPIC_API_KEY` is set on your project and Coffee's. `INTERNAL_API_SECRET` is
set on yours and the Tracker's.

---

## Guidelines

- The editable-draft principle generalises: anywhere you are tempted to make output read-only,
  don't. The corpus this tool learns from is only as good as the edits it captures.
- Prefer adding a style-guide rule over adding a prompt instruction. The guide is versioned,
  inspectable and improvable; a buried prompt string is none of those.
- When a toggle's value would be better as structured data on the contact record, say so rather
  than adding another dropdown. `position` arrived that way and was the right call.
- Run `npm run build` and `npx tsc --noEmit` in `apps/editor` before you push. There is no `test`
  script yet — adding one opts the app into CI's test step automatically, and that would be a
  genuine improvement.
