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
titles. **An issue takes one `agent:` label**, so cross-agent work is a parent (TD) with one
sub-issue per agent (TEC-22 to 25 are the pattern).

**`drift` checks the file stays gone** and no longer parses it. `CLAUDE.md`'s cap is now 400.
**This seat's freshness is dated against `apps/editor`, `scripts` and `.github`**, so it can warn.

**`CLAUDE.md` names Linear's user records under the personal-information rule** — they carry a real
name and email. Nothing mechanical enforces it.

**Coffee and the Resume Formatter have no `agent:`/`owner:` labels yet**; every other agent does.

**`requested-by-joel` stays** (#189): the #186 hook is the gate, the quoted line is the record.

## Build scope — TEC-10 (#191)

**`scripts/build-scope.mjs` is the one reader of each `ignoreCommand`**: CI scopes each app with it
and **fails open**; drift fails a build that reads a path it does not watch (how, and its blind
spots: the file's header). **The hub diffs nothing and builds every production merge** — its
prebuild reads nearly the whole repo — **and still skips previews**, which drift enforces.

## Next for this seat

- **TEC-8:** the hub's glance gets no `/api/summary` requests in production; TechPad Gen's evidence
  points at `INTERNAL_API_SECRET` missing on `tp-home`. Confirm it live, then it is Joel's dashboard step.
- **`CLAUDE.md` says the tracker writes `shared.contacts`; it only reads it** (#199). One line, Joel's.
- **`KICKOFF.md`'s Health and Cookbook blocks are stale** — "day one", Cookbook "site". Drafting is yours.
- **TEC-15 part 2** — file Health's drop of `health.grocery_items` once TEC-23 is live; apply at gate.
- **TEC-7** waits on Joel's "pick up".

**Starting another agent from here works:** `create_session` with its kickoff block plus the task,
`outcome_branch` set. **It cannot message you back**; a one-shot `create_trigger` aimed at its
session is the only way to send it a follow-up. Delete the trigger once it fires.

## How merges work now

**Branch protection requires branches be up to date**, so each merge needs a rebase and a full CI
run: **merges here are serial**, and a batch costs a cycle each.

**Opening a pull request, updating a branch and merging each wait for Joel's click** — a
`PreToolUse` hook since #186. **Joel's word decides scope**; nothing else codifies it.

**Editing `.claude/settings.json`, `CLAUDE.md` or deleting a shared file is refused by the session's
permission classifier** until Joel authorises it in the conversation. Ask in chat; it then passes.

## Traps only here

The `packages/` gap, Vercel state reading and the `migration repair` hook are in `DECISIONS.md`.

- **Check the open list live as the first step of every merge**, never from memory.
- **Cost is context × turns** (#178): **one session, one branch, end it.**
- **Three `claude/cookbook-*` branches are stale** — inside #185, nothing unmerged. Joel deletes them.
- **Add Next steps to any TEC issue missing them** when you list the queue — the rule is `CLAUDE.md`'s.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **`Vercel – tp-message-editor` is red on `main` itself** — frozen editor, **not a gate failure.**
- **`gate` runs after the whole build matrix**, so a green `drift` proves nothing.
- **A pull request body is a claim, not evidence** — read Vercel and Supabase live before repeating
  its deployment steps to Joel.
- **A project env read cannot see shared variables.** Confirm those with Joel.
- **The Vercel connector now lists `update_project` and env-var writes. Do not use them** — Joel,
  2026-09-23: "follow charter". Project settings and env vars stay dashboard work.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
