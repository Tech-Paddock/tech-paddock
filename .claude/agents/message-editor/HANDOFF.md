# Message Editor — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## Your last branch landed

**#27 merged**, squashed to `fdbc4bf`. Five CI jobs green on the exact head. It carried:

- `shared.contacts.position` wired into contact creation and the drafting context
- Tone changed from free text to a picklist
- A new Context input, passed to the model
- A growing input box
- Your worklog, opened at `.claude/worklogs/claude-message-editor-agent-wetwv6.md`

That branch is now merged and **must not be reused**. Delete it and start every subsequent change
on a fresh branch named for the change.

**Two rules you were breaking are now fixed, by you.** You had edited `CLAUDE.md` and kept no
worklog. Both landed as rules after your session started, and you rebased, restored `CLAUDE.md`
byte for byte, opened a worklog, and raised the brief changes for approval instead of making them
quietly. That is exactly the right handling and it is worth repeating next time the rules move
under you.

---

## Three brief changes you raised, still waiting on Joel

You correctly refused to make these yourself. They are now recorded here and on the TD ledger:

1. **Tone is a picklist, not free text.** The brief specified free text. Your code ships a
   picklist. The picklist is better — free text produced unusable one-off values — but the brief
   said otherwise and has not formally been changed.
2. **The Effort toggle was never built and is not wanted.** The brief specifies Quick / Quick+ /
   Thorough mapping to `effort: low/medium/high`. It does not exist in the code and you judged it
   unnecessary. Nobody has confirmed that.
3. **Context is a new input the brief never mentioned.** It ships and it is useful. Also
   unratified.

This charter describes the code as it actually is, because that is what you need to work. But the
three deltas above are **decided by Joel, not by the charter**. Do not treat their presence here as
approval. If he rules against any of them, the code changes, not the doc.

---

## The oldest unexplained thing here

**`editor.model_status` has zero rows.** The login-time model drift check has never once
successfully written. Either nobody has logged in since it shipped, or it is failing silently.

Nobody has diagnosed it. **This is your highest-value next task** — a check that has never fired is
not a check, and it is the only safety net against the pinned model quietly going stale.

Start by confirming whether `/api/login` reaches `lib/modelCheck.ts` at all, then whether the write
fails on permissions, shape, or an unhandled rejection that is being swallowed.

---

## Your app is live but stale

`editor.techpaddock.io` is serving code from **17:48 today** — commit `92c1ec1`. Eleven merges to
`main` since then have not deployed, yours included.

This is not your bug and not yours to fix. Vercel's GitHub App lost its installation when the repo
was transferred, so pushes stopped triggering builds. It is on Joel's list and the Vercel Config
agent's. **But it means you cannot verify anything on the live site right now** — what you see
there is not your code. Test locally.

---

## Next steps

1. Delete `claude/message-editor-agent-wetwv6`. It is merged.
2. Diagnose `model_status`. See above.
3. Consider adding a `test` script to `apps/editor`. CI runs `npm run test --if-present` before
   every build, so adding one opts the app in with no CI change. `resume`, `tracker` and `coffee`
   have tests; `editor` and `home` do not.
4. Nothing else is queued. Ask before starting anything larger than a fix.
