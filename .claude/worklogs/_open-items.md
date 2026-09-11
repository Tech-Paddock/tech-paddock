# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

**Last reviewed: 2026-09-11 22:30 UTC.**

Detail lives in the agent handoffs — `.claude/agents/<agent>/HANDOFF.md`. This file is the index
and the things that belong to nobody else.

---

## Blocking everything else

- **2026-09-11 — PRODUCTION HAS NOT DEPLOYED SINCE 17:48.** Eleven pull requests merged to `main`
  after that and none shipped. Every app serves commit `92c1ec1`. Cause: Vercel's GitHub App lost
  its installation when the repo was transferred to the org and back — a GitHub App is installed on
  an *account*, not a repository. Pushes succeed, CI runs, Vercel never hears. Ruled out: the Hobby
  daily deploy cap (no banner) and `git.deploymentEnabled` (set in none of the five `vercel.json`).
  **Fix is Joel's:** `github.com/settings/installations` → Vercel → confirm `tech-paddock` is in its
  repository list. Then a *new push* against current `main` — not the dashboard Redeploy button,
  which rebuilds the stale commit. Evidence and timestamps in `.claude/agents/platform/HANDOFF.md`.
  **Until this is fixed, nothing can be verified on a live URL.** What is deployed is not what is on
  `main`.

## Waiting on Joel

1. **2026-09-11 — Repoint `tp-coffee-app`.** Root Directory → `apps/coffee`, framework → Next.js,
   five env vars, attach `coffee.techpaddock.io`. **The only publicly exposed thing in the project**
   until it is done: `tech-paddock.vercel.app` serves an empty page outside the password gate,
   because the gate lives in each app's middleware and a project with no app has no gate.
2. **2026-09-11 — Verify the new `SESSION_SECRET` on all five projects.** It was rotated today
   because the old value could not be read back out of the dashboard. Nobody has confirmed it landed
   everywhere, and with deploys broken it is likely no project has picked it up. A partial rollout is
   the silent-SSO failure: no error anywhere, just a login loop.
3. **2026-09-11 — Set `MS_GRAPH_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` and `CRON_SECRET`** on
   `tp-tracker`. Shipped in #22 and inert without them. They degrade quietly by design, so nothing
   will tell you they are doing nothing. Needs a one-time Azure registration against a personal
   Microsoft account.
4. **2026-09-11 — Add `build (coffee)` to branch protection's required checks.** The matrix is five
   jobs; the rule names four.
5. **2026-09-11 — Run `supabase link` and `migration list` once, locally.** Needs an access token no
   agent should hold. Expect eight local matching remote with `20260908235234` remote-only. That gap
   is deliberate. Do not repair it — a hook blocks the command.
6. **2026-09-11 — Close PR #28 and delete three dead branches.** #28 is the superseded original of
   the Coffee app, already conflicting. Branches: `coffee-brewing-assistant-hmvffw`,
   `tracker-dashboard-concept-r6p9up`, `resume-editor-design-wccfly`. The git proxy returns 403 on
   `--delete`, so this is a GitHub UI job.

## Decisions made, so they are not reopened

- **2026-09-11 — Google Tasks → Microsoft To Do: APPROVED.** One Azure registration serves both
  calendar and tasks; Google would have meant a second OAuth setup for no extra capability.
- **2026-09-11 — The `tp-` prefix on Vercel project names STAYS.** A proposal to rename live
  projects to bare names was declined. The table was corrected instead.
- **2026-09-11 — Supabase + Vercel Config agents MERGED into Platform Config.** The seam between
  them leaked: the database's credentials live in Vercel.
- **2026-09-11 — PR #27's three brief contradictions: RATIFIED.** Tone as a picklist, the Effort
  toggle deliberately not built, the Context input. Settled; recorded in the Message Editor charter.

## Mistakes, recorded so they are not repeated

- **2026-09-11 — PR #27 was merged when it should have been held.** It contradicted three settled
  decisions in the brief. Every first-order check passed — clean rebase, worklog opened, `CLAUDE.md`
  untouched, CI green on the head — and it was merged on that basis, with ratification asked for
  afterwards. Joel's correction: reject it and kick it back to the agent to ask him. The outcome was
  approval; the handling was still wrong, because code already written applies pressure to approve
  it and the brief ends up following the code. **Two rules came out of this**, both now in
  `CLAUDE.md`: ask before you build when a change contradicts something settled, and answer the
  second-order questions before a change is agreed.
- **2026-09-11 — The `/api/summary` flag was wrong, and it was the TD's error.** Raised as widening
  `INTERNAL_API_SECRET` across four apps, from reading design notes rather than the route. The
  carve-out is one exact path, mirrors the editor's `/api/draft` precedent, is read-only and fails
  closed. Recorded as mistaken rather than quietly dropped. **Verify from the code.**

## Known, deliberately not fixed

- **2026-09-11 — Every push rebuilds every Vercel project.** No Ignored Build Step. The change is
  written and agreed — one `ignoreCommand` line per app's `vercel.json`, in the Platform handoff —
  and not landed. Merging it is also the cleanest way to clear the deploy backlog.
- **2026-09-11 — DNS is wired two ways.** `editor` resolves through `vercel-dns-017.com`; the others
  use the legacy `76.76.21.21` A record. Both work. If switching, take each target from that
  project's own Domains tab — they are not interchangeable.
- **2026-09-11 — `/api/health` sits behind the password gate**, so no external monitor can reach it.
- **2026-09-11 — `editor.model_status` has zero rows.** The login-time drift check has never
  successfully written. Not diagnosed, and the oldest unexplained thing here.
- **2026-09-11 — The hub's mobile login bug.** Opening a tool from an embedded tile re-triggers that
  app's login on mobile. Reported on mobile Chrome, so the Safari/ITP explanation does not fit.
  Check what URL the iframe actually loads first.

## Read this before transferring the repo again

**A repo transfer breaks every running agent session, irreversibly for that session**, and it is
what broke deployments today.

- A session's authorized repository set is **fixed when the session starts**. When the repo moved,
  the running TD session lost `git fetch` and every GitHub API call and could not be repaired —
  `add_repo` refuses cross-owner additions.
- **GitHub App installations do not transfer with a repository.** Reconnecting the connector does
  not help: it re-authorizes an identity, it does not create an installation on an org that has
  none.
- **Vercel's app is subject to exactly the same thing**, which is this morning's lesson arriving
  again this evening as a three-hour deployment outage.

Before the next transfer: install Claude's **and** Vercel's GitHub Apps on `Tech-Paddock` first,
with "only select repositories" — the org already holds three unrelated repos. Then stop every
running session. Then move. In that order.

## Enforcement status

Rules in `CLAUDE.md` are written, not enforced. Only three things enforce:

1. **Branch protection** — configured, but probably inert while the repo sits on a personal account.
   **Assume `main` is unprotected.**
2. **CI** — five matrix jobs. Hardcoded; a sixth app is silently untested until added.
3. **Hooks** — three in `.claude/settings.json`, currently doing the real work. `SessionStart`
   prints this ledger into every session; two `PreToolUse` guards refuse a push to `main` and refuse
   `supabase migration repair`. They work regardless of GitHub plan.
