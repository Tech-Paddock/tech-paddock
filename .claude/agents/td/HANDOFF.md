# Technical Director — handoff

State as of 2026-09-19.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**One branch is mine** — `claude/brief-tracker-live-close-item-10`, the ledger and three charters
catching up with what Joel settled. **Six pull requests merged on 2026-09-19**, #145 to #150, and
both stacked platform branches went with them. Joel retired **three agents** that day; **five
remain**, and **you own `apps/editor`** — frozen, the first app folder this seat has held. **Two TD
sessions ran at once that evening.** **Re-read `main`, and the open list, before trusting either.**

## What is true now

**The repository is public**, as of 2026-09-19 — which made Actions free and ended the minutes
outage. **`.claude/` is public reading now**: the charters, the ledger, every carve-out below.

**Postgres is yours; deliveries are TechPad Gen's** since 2026-09-19 — the database stayed because
migrations are applied at the gate. **You own the merge; they own what happens after it.**

**Branch protection is on**, confirmed against the GitHub API. **`Require branches to be up to
date` is on**, which gives the merge-order rule teeth: after any merge every other pull request is
behind and must take `main` again. `Block force pushes` and `Restrict deletions` are also on.

**Standing up a new agent has a written protocol**, `.claude/agents/STANDUP.md`. **Do not scaffold
before solutioning exists** — a folder name reaches DNS and a schema name the database.

**The required checks are `gate`, `drift` and `requested-by-joel`** — switched 2026-09-16, each
bound to the GitHub Actions app rather than to any source. **No agent can read rulesets**, so that
is Joel's screenshot rather than a measurement; treat it as the best available and say so.

**Previews are off, and each app builds only when its own folder changes** — `ignoreCommand` in its
`vercel.json`, in the repo rather than a dashboard. **Every failure mode builds rather than skips.**
**Verified live across the six merges of 2026-09-19**: at most two of six projects built each time.
**The hub also watches `.claude`** (#145) because it alone reads above its folder — item 20 is the
class that fix did not close. `HEAD^..HEAD` is only right because this repo squash-merges.

**You apply migrations at gate time**, through the hosted API, before merging. `supabase db push`
cannot work here and never will — see the traps in `.claude/DECISIONS.md`.

**A green `build (app)` no longer means that app was built** — per-app scoping landed in #57 and
its skip path has still never executed in CI. It fails loudly rather than passing something untested.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge.** Not from memory, not
  from twenty minutes ago. Other agents open pull requests while you work and you cannot see it
  happen. This has already been broken once — see `.claude/DECISIONS.md`.
- **Read the real head SHA before passing `expectedHeadSha`.** Inventing a full SHA from a short
  prefix has been done twice; the guard rejected both.
- **Do not backfill another agent's handoff on the way past.** A stale handoff sends the change
  back; one you write is the second-hand account these files exist to replace.
- **`DECISIONS.md` is AT its ceiling, 260/260, with no trimming rule.** The next entry does not
  fit. That is Joel's call — raise it or authorise a compaction — never a squeeze.
- **`live: false` on a Vercel project does not mean paused.** Read deployment state — `BLOCKED` is
  paused, `READY` at `target: production` is not. This cost the ledger a false claim for a day.
- **Regenerating another agent's collector output ages their handoff.** A commit of yours touching
  `apps/home/lib/*.generated.ts` makes TechPad Gen read stale. Warn only, clears next session.
- **You are a session, not a service** — you never persist or monitor. Tell Joel which mode is live.
- **The `supabase migration repair` hook matches the string in any Bash command**, including one
  one merely writing documentation — it fired again on 2026-09-19. Use Write or Edit; obfuscating
  the string to get a Bash command through is routing around a hook.

## Next

**Joel ordered three builds on 2026-09-19 and the order is not arbitrary. Item 4 first** —
`packages/shared`, **not npm workspaces**, since a root install costs the per-app independence the
CI matrix rests on. **Then item 1, which he settled as the shared table** over the firewall rate
limit, accepting that the hub gains database credentials; after 4 it is one edit rather than six.
**Item 3, `On track`, is independent.** **Surface is yours and unwritten** — item 7; its mockups are
a canvas artifact, so the guide must carry the rules in words.

**Every agent has a board, URLs in `KICKOFF.md`** — the only place they live, so an agent that loses
its URL publishes a duplicate. **You are the rollup.** Joel, 2026-09-19: **a merge refreshes the
merged agent's board too** — not in `CLAUDE.md` yet. **Their DevOps row and a dated TD banner only**;
their Brief and Items stay theirs.
