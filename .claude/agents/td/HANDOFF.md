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

**Cost = context × turns.** Every token admitted is re-paid on every turn after it.

- This seat checks out at **16,563 tokens**; a ~10-turn gate is **$0.24 fresh against $5.80 at
  387K**. **One session, one branch, end it.**
- A pull request is ~**$5** at 387K and **free when Joel opens it in a browser** — which is why PR
  creation and merging are moving to him.

## Linear, part-built — one step blocks the rest

Workspace `tech-paddock`, team **TEC**, bot mailbox `claude@techpaddock.io` live via Cloudflare,
bot account created and left **admin** (role restriction is paywalled, not worth buying).

**The connector is still authorised as Joel's personal account** — checked four times. **Nothing
else in the cutover starts until that flips.** The plan is in this branch's pull request body.

**Phase 2 needs a charter PII line first.** Linear user objects carry Joel's real name and email,
nothing enforces `CLAUDE.md`'s rule against committing either, and whatever reads Linear must map
users to the repo's short names.

## The debrief is dead

Joel stopped it 2026-09-22. **The sign-off spec is deleted, not replaced** — no script, no new file.
~145 lines off `CLAUDE.md`, 521 → ~376, **resolving item 28 as a side effect.** Status is now a
question he asks.

## The queue, and the one thing at risk

**Merge order, decided before any of it merged**: #174 → #175 → Coffee → this branch last, because
this seat is the only one still live and takes the `DECISIONS.md` conflict with #175.

**The four Cookbook branches were a stack; #175 is the tip carrying all four.** Merging them
individually reproduces the #51/#52/#53 cascade. Three ancestors plus
`claude/cookbook-handoff-after-merge` are superseded and **need deleting — Joel's alone**.

**TechPad Gen's `ThemeControl.tsx` work never reached the remote.** If that session ended it is gone;
the rebuild spec is in its close-out prompt.

## Health's #116 — answered, not landed

Blocked four days on three questions to this seat. Joel answered 2026-09-22: append-only wins;
snapshot the macros **but store the item id and version so a backfill stays possible**; copy
`lib/models.ts` with a flag. **`HEALTH-PLAN.md` still carries the sentence the charter contradicts**
— Joel's file, one sentence, the only loose end.

**#116 is the ledger cap's cost, stated by the agent it blocked** — three rows would have breached a
budget in a file Health does not own, so a real request went where nobody reads.

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
