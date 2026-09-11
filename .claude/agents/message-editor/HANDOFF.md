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

## The three brief changes you raised: all ratified

Joel approved all three on 2026-09-11. They are settled and now live in `RULES.md` as the
specification rather than as open questions: tone is a picklist, there is no Effort toggle and there
will not be one, and Context is a supported input.

You were right to raise them rather than make them. **The handling afterwards was wrong, and that
is worth knowing** because it changed the rules you work under: the TD merged #27 first and asked
for ratification second. Code already written applies pressure to approve it, so the brief ends up
following the code. Joel's correction was that the pull request should have been held and sent back
to you with the question put to him.

Two rules came out of that, both now in `CLAUDE.md`:

- **Ask before you build**, when what you are about to build contradicts the brief or your charter.
  Raising it in the pull request is the backstop for something you only discover late, not the
  normal path.
- **Answer the second-order questions** before a change is agreed — what does it contradict, who
  depends on it, what becomes true afterwards, what does it make harder to change, who decides.

The structural fix is in your favour: your tool's specification now lives in `RULES.md`, in your own
folder, which you may **propose** changes to in a pull request. Under the old layout the spec sat in
`CLAUDE.md`, which you were forbidden to touch — so an agent finding its spec outdated had no move
except to build the contradiction and flag it afterwards. That dead end is gone.

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

`editor.techpaddock.io` is serving code from **17:48 today** — commit `92c1ec1`. Everything merged to
`main` since then is undeployed, yours included.

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
