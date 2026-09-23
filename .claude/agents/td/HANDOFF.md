# Technical Director — handoff

State as of 2026-09-22. `RULES.md` has the role and the gate, `DECISIONS.md` the reasoning; this is
only what is true right now.

---

**Branch state is not written here — it went stale inside one session.** Read it live:
`git ls-remote --heads origin`, the open pull request list, check runs on the head SHA.

## DevOps is written into the charters

**Vercel, DNS, CI and deploys are this seat's**, and after `claude/brief-devops-to-td` every file
says so once: `CLAUDE.md`'s roster, `td/RULES.md`, `techpad-gen/RULES.md` and `KICKOFF.md`. **The
trap list moved verbatim**; TechPad Gen keeps a pointer because the Pit Wall reads Vercel.

## Cost, measured 2026-09-22

**Cost = context × turns.** A fresh session of this seat checks out at ~16.5K tokens; a ~10-turn
gate is **$0.24 fresh against $5.80 at 387K**, so **one session, one branch, end it.** A pull
request is ~$5 at that size and free when Joel opens it in a browser. Full figures in #178.

## Linear, part-built — one step blocks the rest

**The connector authenticates as `claude@techpaddock.io`**, and **Phase 1 is done**: the eleven
ledger items are TEC-5 to TEC-15, titled with their ledger number, labelled `owner:`/`agent:`,
priority from the ledger section. **Linear is now write-only and `OPEN-ITEMS.md` read-only** until
Phase 2 deletes it. TEC-1 to 4 are Linear's onboarding issues, left alone. The plan is in #178's
body — Phase 2 is one atomic branch or it leaves a window where the hook prints a file that is gone.
**The GitHub bot is measured**: `claudetechpaddock`, role `write`, `admin: false`. What
`requested-by-joel` checks now that the bot and Joel are different accounts is **Joel's call, and
undesigned**.

**Phase 2 needs a charter PII line first.** Linear user objects carry a real name and email, nothing
enforces `CLAUDE.md`'s rule against committing either, and whatever reads Linear must map users to
the repo's short names.

## The debrief is dead

Joel stopped it 2026-09-22, and `claude/brief-drop-sign-off` deletes it: the spec, the board rule,
`BOARD.html` and its kickoff URL. `CLAUDE.md` goes 521 → 370, **which resolves item 28 (TEC-5)** —
close it in Linear once that merges. **No status rule survives**; ledger numbers stay `drift`'s.

## The queue cleared 2026-09-22, and what it left

**Six merged** — #174, #179, #176, #175, #177 and this — in an order decided before any landed.
**Branch protection requires branches be up to date; measured now, not a screenshot.** Each needed a
rebase and a full CI run, so **merges here are serial** and a batch costs a cycle each. One PR
merged as it finishes never meets the rule.

**Every dead branch is gone** — `main` is the only remote head, measured 2026-09-22.

**#177's two extras are in its commits**: a handoff conflict resolved by taking TechPad Gen's own
newer copy whole — lossless by inspection, never a judgement, because a handoff is not this seat's
to author — and `drift`'s `SWEPT` list now **derived from `MANIFEST`**, after stamping seven apps
falsely flagged three agents stale for a banner none of them wrote.

## Health is unblocked and has not started

#116's answers landed in `HEALTH-PLAN.md` via #179 after blocking Health four days. **The schema is
unwritten and is Health's** — migrations are applied here at gate time, so one designed here would
be gated alone. Its prompt is written.

**#116 is the ledger cap's cost, stated by the agent it blocked** — three rows would have breached
an 80-line budget in a file Health does not own, so a real request went where nobody reads. **It
happened twice more tonight**: item 28 barely fit, and item 29 needed two entries compacted.

## Traps only here

The freshness check, ledger parse, `packages/` gap, Vercel state reading and the `migration repair`
hook are all in `DECISIONS.md` now.

- **Check the open list live as the first step of every merge**, never from memory.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **`Vercel – tp-message-editor` is red on `main` itself** — frozen editor, **not a gate failure.**
- **`gate` runs after the whole build matrix**, so a green `drift` proves nothing.
- **A pull request body is a claim, not evidence** — read Vercel and Supabase live before repeating
  its deployment steps to Joel.
- **A project env read cannot see shared variables.** Confirm those with Joel.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
