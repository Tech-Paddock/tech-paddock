# Technical Director — handoff

State as of 2026-09-23. `RULES.md` has the role and the gate, `DECISIONS.md` the reasoning; this is
only what is true right now.

---

**Branch state is not written here — it went stale inside one session.** Read it live:
`git ls-remote --heads origin`, the open pull request list, check runs on the head SHA.

## Linear holds the open items, and nothing prints them

**`.claude/OPEN-ITEMS.md` is deleted** (#187). The `SessionStart` hook
prints one fixed line pointing at Linear, team TEC, so **every session has to call Linear itself** —
Joel's choice over a generated copy, recorded in `DECISIONS.md`. **The connector authenticates as
`claude@techpaddock.io`.** Issues carry `owner:` and `agent:` labels; old ledger numbers survive in
titles. TEC-1 to 4 are Linear's onboarding issues, left alone.

**`drift` checks the file stays gone** and no longer parses it. `CLAUDE.md`'s cap is now 400.
**This seat's freshness is dated against `apps/editor`, `scripts` and `.github`**, so it can warn.

**`CLAUDE.md` names Linear's user records under the personal-information rule** — they carry a real
name and email. Nothing mechanical enforces it.

**Three handoffs still say "ledger"** — filed as TEC-17 (TechPad Gen), TEC-18 (Health) and TEC-19
(Cookbook). Their charters are already corrected here. `agent:`/`owner:` labels for Health and
Cookbook were created 2026-09-23; Coffee and Resume Formatter still have none.

**Phase 3 is done.** #98 and #116 are closed; #116's live proposal is TEC-21. **`requested-by-joel`
stays** (#189): the #186 hook is the gate, the quoted line is the record. A fresh session on `main`
(2026-09-23) was pointed at Linear by the hook and listed TEC live — the last open step.

## Build scope — TEC-10, on `claude/ci-build-scope-packages`

**`scripts/build-scope.mjs` is the one reader of each `vercel.json` `ignoreCommand`.** CI calls it
for its per-app scope (plus `.github/workflows` and `supabase`), and **fails open** — an unreadable
scope builds. `drift`'s *every build watches what it reads* derives what each build reads outside
its folder and fails a read the pathspec misses; how it finds reads, and what it cannot see, is in
the file's header. **The hub has no diff now: it builds every production merge**, because its
prebuild reads nearly the whole repo and The Garage's build-time panels must stay current. **It
still skips previews** — drift hard-fails an `ignoreCommand` that stops doing that.

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
- **The Vercel connector now lists `update_project` and env-var writes. Do not use them** — Joel,
  2026-09-23: "follow charter". Project settings and env vars stay dashboard work.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
