# Technical Director — handoff

State as of 2026-09-20, written as a handover to a new session of this seat. `RULES.md` has the
role and the gate; this is only what is true right now.

---

## In flight

**Nothing.** #152 to #156 all merged on 2026-09-20, GitHub deleted every branch, and no pull
request is open. `main` is `990a5eb`, `drift` on it **21 ok · 7 warn · 0 fail**, `tp-home` `READY`
at `target: production`. **A clean queue is unusual here — check it live anyway.**

## What is true now

**`packages/shared` is the one real copy** of `auth.ts`, `password.ts`, `theme.css`, `theme.ts` and
`next.config.mjs`; `scripts/stamp-shared.mjs` writes it outward and `drift` fails a copy that
disagrees. **Edit canonical and restamp — never a copy.** A lockout fix is one edit, not six.

**Surface is written**: `.claude/SURFACE.md`. **Page count is not the test** — Coffee, the Resume
Formatter and the Message Editor each have one route and only Coffee is an app. `CLAUDE.md` and
`STANDUP.md` point at it; `drift` scans it.

**`DECISIONS.md` has sections and a 400-line ceiling**, 278 used. **Append inside the section that
describes your entry**, never at the end. Do not trim to make room; it is not read at session start.

**Previews are off and staying off — Joel ruled on it 2026-09-20**, so **`On track` does not exist**
and there are three phrases and five stages. **Read its `DECISIONS.md` entry before rebuilding it.**

**Publish only your own board.** Joel reversed the merge-refresh rule on 2026-09-20: a merge leaves
the merged agent's board alone, stale or not. **Yours is the rollup, read from the repo and never
written back.** Board URLs live in `KICKOFF.md` and nowhere else.

**The repository is public** since 2026-09-19, so **`.claude/` is public reading**. Same day,
**Postgres stayed yours and deliveries went to TechPad Gen**: you own the merge, they own after it.

**Branch protection is on**, confirmed against the GitHub API, and **`Require branches to be up to
date` is on** — after any merge every other pull request is behind and must take `main` again.
**Required checks are `gate`, `drift`, `requested-by-joel`.** No agent can read rulesets, so that
last part is Joel's screenshot rather than a measurement — say so when you repeat it.

**You apply migrations at gate time**, through the hosted API, before merging. `supabase db push`
cannot work here and never will — see the traps in `.claude/DECISIONS.md`.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge**, never from memory —
  others open pull requests while you work and you cannot see it happen.
- **Read the real head SHA before passing `expectedHeadSha`.** Inventing or abbreviating one has now
  been done three times; the guard rejected all three, which is the only reason it costs a retry.
- **A merge refused straight after you edited the body is usually not real** — editing re-queues
  `requested-by-joel`. **`gate` runs after the whole build matrix**, so a green `drift` proves
  nothing; `build (home)` is usually last, being the only app that really builds.
- **Vercel's `ignoreCommand` is capped at 256 characters and the failure is total.** Over it the
  deployment is rejected outright, not built — every deploy of that app stops, production included,
  with CI green throughout. `drift` fails it now at 256 and warns at 200; nothing else would.
- **A dry-run merge on a dirty tree proves nothing.** Stashing first merges an empty branch and
  reports clean. Commit, then dry-run. A green result you did not earn is worse than a red one.
- **`live: false` on a Vercel project does not mean paused.** Read deployment state — `BLOCKED` is
  paused, `READY` at `target: production` is not. This cost the ledger a false claim for a day.
- **You are a session, not a service** — you do not persist and do not monitor. Say so.
- **The `supabase migration repair` hook matches that string in any Bash command**, including one
  merely writing documentation about it. Use Write instead. **Obfuscating it is routing around a hook.**

## Next

**Item 1 is the biggest thing here and it is one edit now** — the lockout counter moves from a
signed cookie to a shared table: `packages/shared/lib/auth.ts`, stamp, migration in the same PR.
**Item 5 is minutes** — `shared.contacts` write rules, a contract between the editor (yours, frozen)
and the tracker (TechPad Gen's). **Item 20** wants `drift` comparing what a build reads with what
its `ignoreCommand` watches — on 2026-09-20 `build (home)` skipped on four `.claude`-only branches
and Vercel was the only thing that built the hub.

**Waiting on Joel: item 3** (whether drive-before-merge is wanted at all) and **item 21** (the
Cookbook's surface, and `STANDUP.md` step 1). **`claude/health-recipes` must not be deleted** — the
only record of its design. Coffee's branch is 🟣; its work landed as #150.

**Do not inherit this as measured:** anything behind `techpaddock.io` or a `*.vercel.app` host.
This session's proxy refused both, so every claim about a live page here is a Vercel API reading
rather than an HTTP response. Say which one you have.
