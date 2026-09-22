# Technical Director — handoff

State as of 2026-09-22. `RULES.md` has the role and the gate, `DECISIONS.md` the reasoning; this is
only what is true right now.

---

**Branch state is not written here — it went stale inside one session.** Read it live:
`git ls-remote --heads origin`, the open pull request list, check runs on the head SHA.

## Owned, and the change that has not landed

**DevOps is yours as of 2026-09-22** — Vercel, DNS, CI, deploys, alongside the merge.
**The charter change is not written**: `CLAUDE.md`'s roster, `td/RULES.md`, `techpad-gen/RULES.md`
and `KICKOFF.md` all still describe the old split, and `td/RULES.md:92` still says watch
**Platform**, retired 2026-09-19. **The Vercel trap list moves with the seat, verbatim**, out of
TechPad Gen's kickoff block, or the move relocates the error it prevents.

## Cost, measured 2026-09-22

**Cost = context × turns.** A fresh session of this seat checks out at ~16.5K tokens; a ~10-turn
gate is **$0.24 fresh against $5.80 at 387K**, so **one session, one branch, end it.** A pull
request is ~$5 at that size and free when Joel opens it in a browser. Full figures in #178.

## Linear, part-built — one step blocks the rest

**The connector is still authorised as Joel's personal account** — checked five times. **Nothing
else in the cutover starts until that flips.** Workspace, team key and members read live; the bot is
admin because role restriction is paywalled and not worth buying. The plan is in #178's body: Phase
1 seeds and touches no repo file, Phase 2 is one atomic branch or it leaves a window where the hook
prints a file that is gone.

**Phase 2 needs a charter PII line first.** Linear user objects carry a real name and email, nothing
enforces `CLAUDE.md`'s rule against committing either, and whatever reads Linear must map users to
the repo's short names.

## The debrief is dead

Joel stopped it 2026-09-22. **The sign-off spec is deleted, not replaced** — no script, no new file.
~145 lines off `CLAUDE.md`, 521 → ~376, **resolving item 28 as a side effect.** Status is now a
question he asks.

## The queue cleared 2026-09-22, and what it left

**Six merged** — #174, #179, #176, #175, #177 and this — in an order decided before any landed.
**Branch protection requires branches be up to date; measured now, not a screenshot.** Each needed a
rebase and a full CI run, so **merges here are serial** and a batch costs a cycle each. One PR
merged as it finishes never meets the rule.

**Four Cookbook branches are dead and need deleting — Joel's alone.** The three stack ancestors
under #175, plus `claude/cookbook-handoff-after-merge`, superseded twice.

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
