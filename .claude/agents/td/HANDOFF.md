# Technical Director — handoff

State as of 2026-09-22, written as a handover to a new session of this seat. `RULES.md` has the role
and the gate; this is only what is true right now.

---

## Branch state is deliberately not written here

It was, and it went stale inside one session — #164 and `claude/brief-drop-compaction` were both
described as open after they had merged. **Read it live**: `git ls-remote --heads origin`, the open
pull request list, and check runs on the head SHA. `DECISIONS.md` has why the freshness check missed it.

## What this seat now owns

**DevOps is yours as of 2026-09-22** — Vercel, DNS, CI and deploys, alongside the merge. `DECISIONS.md`
has the reasoning and the four contradictory statements it replaced. **The charter change is not
written yet**: `CLAUDE.md`'s roster, `td/RULES.md`, `techpad-gen/RULES.md` and `KICKOFF.md` all still
describe the old split, and `td/RULES.md:92` still says to watch **Platform**, retired 2026-09-19.

**The Vercel trap list moves with the seat, verbatim**, out of TechPad Gen's kickoff block: *read
deployment state, never a project field* — `BLOCKED` is paused, `READY` at `target: production` is
live, `CANCELED` at `target: null` is a skipped preview. Dropping it relocates the error.

## The cost model, measured 2026-09-22

**Cost = context × turns.** A token admitted to context is re-paid on every turn after it.

- A fresh session of this seat checks out at **16,563 tokens** — `CLAUDE.md` 9,264 + ledger 1,258 +
  charter 4,748 + handoff 1,293. A ~10-turn gate costs **$0.24 fresh against $5.80 at 387K context.**
- **The doc floor is regressive** — 5% of a 600K session, 46% of a 75K one. Trimming prose pays most
  when sessions are short, and shortening them is the larger lever. **One session, one branch, end it.**
- One sign-off footer is **444 tokens**. Twenty of them cost more than the whole of `CLAUDE.md`.
- One pull request is about **$5** at 387K — $1.73 to write and post, $3.45 to verify CI. **Both
  halves are free if Joel does it in a browser**, which is why he is taking creation and merging.
- **Actions bills nothing** — `total_ms: 0`, public repo, median run 57s. CI is not a cost line.

## Agreed and not yet built

Priority order. `DECISIONS.md` carries the reasoning for each.

1. **The DevOps charter change** — the five files above. It expands this seat's own remit, so it is
   drafted here and approved by Joel, never ratified alone.
2. **`ThemeControl.tsx` into `packages/shared`** — TechPad Gen, in flight. Seven byte-identical
   copies, md5 `22fac7aa`; one `MANIFEST` line plus a restamp, and `drift` enforces it for free.
3. **Linear for open items**, GitHub unchanged as the repo, a Routine generating `OPEN-ITEMS.md` so
   the hook and credential-free reads survive. **Blocked on Joel authorizing the connector.**
4. **Delete `BOARD.html`** and the publish ritual — 336 lines, ~9,000 tokens a session.
5. **`scripts/sign-off.mjs`**, then the `CLAUDE.md` compaction. That is item 28 and it is blocking.
6. **Strip computable state from every handoff.** All six sit at 78–80 of 80 simultaneously; that is
   the cause, not a ceiling set too low.
7. **`drift-check.mjs:311`** — remap `td` off the frozen `apps/editor`.

## Traps specific to this seat

`DECISIONS.md` now carries the dead freshness check, the ledger parse failure and the `packages/` gap.

- **Check the open list with a live call as the first step of every merge**, never from memory.
- **Read the real head SHA before passing `expectedHeadSha`.** Three inventions, three rejections.
- **`Vercel – tp-message-editor` is red on `main` itself** — `BLOCKED`, the frozen editor. It makes
  every PR `mergeable_state: unstable` and **is not a gate failure.** Re-confirmed on three heads.
- **`gate` runs after the whole build matrix**, so a green `drift` proves nothing.
- **A pull request body is a claim, not evidence.** Read Vercel and Supabase live before repeating a
  body's deployment steps to Joel.
- **A project env read cannot see shared variables.** Confirm shared vars with Joel.
- **MCP `apply_migration` cannot record a file's own version** — use `execute_sql` with the DDL and
  the `schema_migrations` insert in one batch. **Item 26's three filenames are unchanged.**
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
- **The `supabase migration repair` hook matches that string in any Bash command.** Use Write.
- **Do not inherit as measured** anything behind `techpaddock.io` or a `*.vercel.app` host — every
  claim about a live page here is a Vercel API reading, never an HTTP response from this container.

## Next

**Item 28 is blocking** — `CLAUDE.md` at 521/530. **Items 1 and 5 above are one conversation.**
Six branches were pushed with no pull request as of 2026-09-22, a pile that grew during a single
session; nothing drains it without a TD session per branch, which is what items 3 and 5 are for.
