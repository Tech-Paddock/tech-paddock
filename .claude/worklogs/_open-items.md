# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

Last reviewed: 2026-09-11 20:35 UTC — queue cleared, eight PRs merged

**Pit Wall board:** https://claude.ai/code/artifact/9cac3618-1a51-4d5e-82fb-339e96657bf4 — the same
state as this file, plus deployments, CI and branches, as a page. It does not poll anything; it is
exactly as fresh as the last time the TD wrote to it, and it says so on its face. When its age
readout is amber or red, check Vercel and GitHub directly rather than trusting it.

---

## Waiting on Joel

- **2026-09-11 — Branch protection is configured but almost certainly NOT ACTIVE right now.**
  Answered and then undone by circumstance. A correct ruleset was built while the repo sat in the
  `Tech-Paddock` org — Active, empty bypass list, PR required, 0 approvals, four build checks,
  linear history, squash-only, conversation resolution, force-push and deletion blocked. The repo
  has since been transferred **back to `joelb-401`**, and protection on a private repo under a
  personal account generally needs a paid plan, so the ruleset is likely gone or inert.
  **Assume `main` is unprotected until proven otherwise.** Every rule in `CLAUDE.md` is convention
  again in the meantime. Plan of record: agents finish their current work, then the repo moves back
  to the org and protection is re-enabled.
  **Do not re-transfer without warning every running session** — the move breaks GitHub access for
  any session already running, and it cannot be repaired mid-session (see the note at the bottom).
- **2026-09-11 — Hooks: DONE.** `.claude/settings.json` now carries three, deliberately few. A
  `SessionStart` hook prints this ledger into every session, so leading with open items no longer
  depends on an agent remembering to look. Two narrow `PreToolUse` guards refuse a push to `main`
  and refuse `supabase migration repair`. Both were verified against real command shapes before
  landing, including that `claude/main-thing` is not mistaken for `main`.
  **These are the only enforcement that does not depend on an agent choosing to comply**, and they
  work regardless of GitHub plan — which matters while branch protection is inert.
  Deliberately NOT added: PII pattern matching (regex on prose is noisy and would cry wolf) and
  Vercel/DNS guards (those go through MCP tools, not Bash, so a Bash matcher would not see them).
  A hook that fires on the wrong thing teaches agents to route around hooks.
- **2026-09-11 — Set `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_REFRESH_TOKEN` and
  `CRON_SECRET` on `tp-tracker`.** The Microsoft To Do integration and the daily cron shipped in #22
  and are **inert** until these exist. The code degrades quietly by design, which is right at
  runtime and means **nothing will tell you it is doing nothing**. Needs a one-time Azure app
  registration against a personal Microsoft account.
- **2026-09-11 — Add `build (coffee)` to branch protection's required checks.** The matrix is five
  jobs now. The rule still lists four, so the new one is not actually required.
- **2026-09-11 — Run `supabase link` and `migration list` once, locally.** Needs an access token
  no agent should hold. Three commands, in `supabase/README.md`. Expect eight local files matching remote, with
  `20260908235234` showing remote-only; that gap is deliberate. Do not `migration repair` it.

## Committed, not done

- **2026-09-11 — Node runtime drift. DONE, #20.** CI pinned 20 while all five Vercel projects run
  24, with no `engines` field anywhere, so CI could go green on a runtime that never ships. CI moves
  to 24 and `engines: >=24` is declared. Verified on Node 22 that the constraint warns rather than
  breaks.
- **2026-09-11 — PII scrub. DONE, #21.** A real target company name sat in a UI placeholder in
  `apps/resume/app/page.tsx` and in five fixtures in `apps/resume/tests/persistence.test.ts`,
  replaced with a synthetic one. It was also named three times in this repo's own handoff docs —
  including the document explaining the rule — and has been removed from those too.
- **2026-09-11 — Branch queue: CLEARED.** #16 through #23 are on `main`. Everything that was in
  flight has landed: the rules, the worklog channel, the migration backfill, the agent briefs, the
  UI polish, the Node alignment, the PII scrub, the hub dashboard with Microsoft To Do, and the
  Coffee app as a fifth app with five CI matrix jobs.
- **2026-09-11 — Six superseded branches need deleting**, and the git proxy refuses `--delete`
  (403 on deletion while permitting pushes), so this is a GitHub UI job:
  `this-n2kl8y`, `tracker-dashboard-concept-r6p9up`, `coffee-brewing-assistant-hmvffw`,
  `resume-formatter`, `resume-editor-design-wccfly`, `devops-merge-commits-ts7ohz`.
- **2026-09-11 — The Message Editor agent is live** on
  `claude/message-editor-agent-wetwv6` and has wired up `contacts.position` — correctly, and it was
  the first item in its brief. It also edits `CLAUDE.md` and keeps no worklog, both now forbidden.
  Worth a word to that agent rather than a fix by the TD; do not rewrite a live agent's branch.

## Read this before transferring the repo again

**2026-09-11 — A repo transfer breaks every running agent session, irreversibly for that session.**
Moving `tech-paddock` to the `Tech-Paddock` org cost roughly two hours. What happened, so the next
move is cheaper:

- A session's authorized repository set is **fixed when the session starts**. When the repo moved,
  the running TD session lost `git fetch` and every GitHub API call, and could not be repaired —
  `add_repo` refuses cross-owner additions, so there was no way back in.
- **GitHub App installations do not transfer with a repository.** The new org started with zero
  apps. That is why Claude could not see the repo in its picker, and reconnecting the GitHub
  connector did not help: reconnecting re-authorizes an identity, it does not create an installation
  on an org that has none. The app has to be installed on the org explicitly.
- **Vercel's app is subject to exactly the same thing.** If it is not installed on the org, pushes
  stop triggering deployments and nothing announces it — the projects and custom domains survive,
  the git trigger quietly does not.

Before the next transfer: install both apps on the org first, stop all running sessions, move the
repo, then start fresh sessions. In that order.

## Known and deliberately not fixed

- **2026-09-11 — `tp-coffee-app` is UNBLOCKED and still wrong.** `apps/coffee` is now on `main`, so
  the reason to wait is gone. Root Directory → `apps/coffee`, framework → Next.js, env vars
  including `ANTHROPIC_API_KEY`, attach `coffee.techpaddock.io`. Until then it still serves an empty
  page publicly, outside the password gate. Live infrastructure, so it is Joel's, not the TD's.
- **2026-09-11 — A new Postgres schema inherits no grants at all.** `20260910051549` granted USAGE
  by naming four schemas explicitly, so `coffee` arrived unreadable even by `service_role` — the app
  would have deployed and failed on permissions, with nothing in its own code to explain why. Fixed
  by `20260911203100`, and `supabase/README.md` now states the rule: adding a schema means two
  migrations, not one.
- **2026-09-11 — Every push rebuilds every Vercel project.** No Ignored Build Step on any of the
  five, so a resume-only commit rebuilds the editor. Five builds per push on a hobby plan. Cheap to
  fix, not urgent.
- **2026-09-11 — DNS is wired two ways.** `editor` resolves through `vercel-dns-017.com`; the other
  three use the legacy `76.76.21.21` A record. Both work. Switching the two subdomains to CNAMEs is
  hygiene, not a problem.
- **2026-09-11 — `/api/health` sits behind the password gate**, so no external uptime monitor can
  reach it. Fine if it is for human use; a blocker if it is ever meant for monitoring.
- **2026-09-11 — `editor.model_status` has zero rows.** The login-time model drift check has never
  successfully written. Either nobody has logged in since it shipped, or it is failing quietly.
  Not diagnosed.

## Flagged and stood down

- **2026-09-11 — `/api/summary`: CONCERN WITHDRAWN, and it was the TD's error.** It was flagged as
  widening `INTERNAL_API_SECRET` into a shared key across four apps. Reading the code rather than
  the design notes: the carve-out is `pathname === "/api/summary"` exactly, mirroring the editor's
  existing `/api/draft` precedent, read-only, failing closed without the secret, four-second
  timeout, and `SOURCES` held two entries rather than four. It followed the blessed pattern rather
  than breaking it. Merged in #22. Recorded because the next TD should know the flag was wrong, not
  just that it was lifted.
- **2026-09-11 — Google Tasks → Microsoft To Do: APPROVED.** A stack change the brief named
  explicitly, so it needed the author's sign-off and got it. The calendar half had to be Outlook
  regardless, and one registration serves both. The brief was updated by the TD, not by the branch.
- **2026-09-11 — The `coffee` branch's naming proposal.** It rewrites the Domain Map to bare names
  (`editor`, `coffee`) and states a convention the live account contradicts. Decision: the `tp-`
  prefix stays, the table was corrected instead, and that branch should drop its naming section
  before merging.
