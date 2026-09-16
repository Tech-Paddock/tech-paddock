# Message Editor — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**`editor.techpaddock.io` is live and serving current `main`.** Everything this agent has built is
merged; nothing is in flight and no branch of yours exists.

**Your tool's specification lives in your own `RULES.md`**, not in `CLAUDE.md`. That matters: you may
**propose** a change to it in a pull request. Under the old layout the spec sat in a file you were
forbidden to touch, so an agent finding its spec outdated had no move except to build the
contradiction and flag it afterwards. That dead end is gone.

**Three decisions are settled and recorded in your charter** — tone is a picklist, there is no Effort
toggle and there will not be one, and Context is a supported input. The original brief said otherwise
on all three. Do not "correct" them back.

**The cross-app contract you host:** the Pipeline Tracker calls your `/api/draft` server to server
with an `INTERNAL_API_SECRET` header, and your `middleware.ts` lets that through for `/api/draft`
only, matched as an exact path. **That scoping is load-bearing and is not yours to widen.** If
another agent needs a second route exempted, that is their pull request to argue and the TD's to
approve.

## Traps specific to this app

- **Training is batched and never per-message.** Folding one message into the style guide via a model
  call every time you hit send would drift the rules on a sample size of one. If you find yourself
  reaching for "call the model to regenerate the whole artifact" on a write path, you have taken a
  wrong turn.
- **The draft renders as an editable textarea, not read-only.** It exists to be edited to match what
  was actually sent before logging — the corpus this tool learns from is only as good as the edits it
  captures. That principle generalises: anywhere you are tempted to make output read-only, don't.
- **`style_guide` inserts a new version and never overwrites**, so past guides stay recoverable.
- **Do not swap the pinned model on your own initiative.** A new model can carry API-shape changes
  worth reading first — exactly what happened when `effort` moved under `output_config`.
- **This is the tool most likely to have real contact data pass through it.** Every fixture is a
  place a real name could hide. Keep them synthetic.

## In flight

Nothing.

## Next

1. **Diagnose `editor.model_status`.** It has **zero rows** — the login-time model drift check has
   never once successfully written, and it is the oldest unexplained thing in the project. A check
   that has never fired is not a check, and it is the only safety net against the pinned model
   quietly going stale. **This is your highest-value task.** Start by confirming whether
   `/api/login` reaches `lib/modelCheck.ts` at all, then whether the write fails on permissions,
   shape, or an unhandled rejection being swallowed. If it turns out to be grants or RLS, it becomes
   Platform's.
2. **Add a `test` script.** CI runs `npm run test --if-present`, so adding one opts this app in with
   no CI change. `editor` and `home` are the two apps without tests.
3. **No writing samples have been loaded yet**, so Train mode has never folded a real batch and the
   style guide is still the seed rules.
4. Nothing else is queued. Ask before starting anything larger than a fix.
