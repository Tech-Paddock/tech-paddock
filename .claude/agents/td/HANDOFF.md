# Technical Director — handoff

State as of 2026-09-23. `RULES.md` has the role and the gate, `DECISIONS.md` the reasoning; this is
only what is true right now.

---

**Branch state is not written here — it went stale inside one session.** Read it live:
`git ls-remote --heads origin`, the open pull request list, check runs on the head SHA.

## Linear holds the open items, and nothing prints them

**`.claude/OPEN-ITEMS.md` is deleted** on `claude/brief-linear-phase-2`. The `SessionStart` hook
prints one fixed line pointing at Linear, team TEC, so **every session has to call Linear itself** —
Joel's choice over a generated copy, recorded in `DECISIONS.md`. **The connector authenticates as
`claude@techpaddock.io`.** Issues carry `owner:` and `agent:` labels; old ledger numbers survive in
titles. TEC-1 to 4 are Linear's onboarding issues, left alone.

**`drift` checks the file stays gone** and no longer parses it. `CLAUDE.md`'s cap is now 400.
**This seat's freshness is dated against `apps/editor`, `scripts` and `.github`**, so it can warn.

**`CLAUDE.md` names Linear's user records under the personal-information rule** — they carry a real
name and email. Nothing mechanical enforces it.

**TEC-16 must merge before or with Phase 2.** The Pit Wall reads the deleted file at build time and
a missing file reads as empty — green build, nothing waiting on Joel. It is TechPad Gen's and was in
progress on 2026-09-23. **Do not merge Phase 2 ahead of it.**

**Three handoffs still say "ledger"** — TechPad Gen's, Health's and Cookbook's. They are not this
seat's to edit; each agent corrects its own next session.

**Still undesigned and Joel's:** what `requested-by-joel` checks now that the bot
(`claudetechpaddock`, `write`, not admin) and Joel are different accounts. Then Phase 3: confirm a
fresh session reads Linear, close GitHub issues #98 and #116.

## Cost, measured 2026-09-22

**Cost = context × turns.** A fresh session of this seat checks out at ~16.5K tokens; a ~10-turn
gate is **$0.24 fresh against $5.80 at 387K**, so **one session, one branch, end it.** A pull
request is ~$5 at that size and free when Joel opens it in a browser. Full figures in #178.

## How merges work now

**Branch protection requires branches be up to date**, so each merge needs a rebase and a full CI
run: **merges here are serial**, and a batch costs a cycle each.

**Opening a pull request, updating a branch and merging each wait for Joel's click** — a
`PreToolUse` hook since #186. **Joel's word decides scope**; nothing else codifies it.

**Editing `.claude/settings.json`, `CLAUDE.md` or deleting a shared file is refused by the session's
permission classifier** until Joel authorises it in the conversation. Ask in chat; it then passes.

## Stale branches on origin

`claude/cookbook-feedback-fixes`, `claude/cookbook-icon`, `claude/cookbook-from-a-file` — all
squash-merged in #185; each differs from `main` only by `main` being newer. **Joel deletes them**;
this seat cannot.

## Traps only here

The `packages/` gap, Vercel state reading and the `migration repair` hook are in `DECISIONS.md`.

- **Check the open list live as the first step of every merge**, never from memory.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **`Vercel – tp-message-editor` is red on `main` itself** — frozen editor, **not a gate failure.**
- **`gate` runs after the whole build matrix**, so a green `drift` proves nothing.
- **A pull request body is a claim, not evidence** — read Vercel and Supabase live before repeating
  its deployment steps to Joel.
- **A project env read cannot see shared variables.** Confirm those with Joel.
- **The Vercel connector now lists `update_project` and env-var writes**; `RULES.md` still says this
  seat cannot change project settings. Unused; Joel's ruling pending.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
