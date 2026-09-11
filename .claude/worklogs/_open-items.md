# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

Last reviewed: 2026-09-11 (post-transfer, access restored)

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
- **2026-09-11 — Blocking hooks: yes or no.** `PreToolUse` hooks that refuse pushes to `main`,
  Vercel/DNS mutations, migrations with no checked-in file, and commits matching PII patterns. The
  only enforcement that works regardless of GitHub plan. Answer after the branch-protection
  question above, since that changes how many are needed.
- **2026-09-11 — `SessionStart` hook: yes or no.** Would print this ledger into every session
  automatically instead of relying on an agent honoring a `CLAUDE.md` instruction. Blocks nothing,
  only surfaces. Recommended.
- **2026-09-11 — Run `supabase link` and `migration list` once, locally.** Needs an access token
  no agent should hold. Three commands, in `supabase/README.md`. Expect six matching rows and
  `20260908235234` showing remote-only; that gap is deliberate. Do not `migration repair` it.

## Committed, not done

- **2026-09-11 — Node runtime drift.** CI pins 20, all five Vercel projects run 24, no `engines`
  field anywhere. CI can go green on a runtime that never ships. Fix is CI → 24 plus `engines`.
  Follow-on PR, not yet opened.
- **2026-09-11 — PII scrub.** `"Attain"`, a real target company, sits in a UI placeholder at
  `apps/resume/app/page.tsx:389` and in five fixtures in `apps/resume/tests/persistence.test.ts`.
  Approved for removal. Follow-on PR, not yet opened.
- **2026-09-11 — Branch queue.** PR #16 and PR #17 both merged; the rules, the worklog channel and
  the migration backfill are on `main`. Remaining order: `this-n2kl8y` → `tracker-dashboard`
  (blocked, see below) → `coffee`. Delete `resume-formatter` (53 behind, conflicts),
  `resume-editor-design-wccfly` (0 ahead) and `devops-merge-commits-ts7ohz` (squash-merged as #16).

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

- **2026-09-11 — `tp-coffee-app`.** Fifth Vercel project, created by Vercel's import-suggestion
  flow, Root Directory pointed at the repo root. Builds nothing, serves an empty page publicly at
  `tech-paddock.vercel.app` outside the password gate. Decision: fix in place, do not delete.
  Blocked until `apps/coffee` exists on `main`, because there is nothing to point it at yet.
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

- **2026-09-11 — `/api/summary` fan-out on the `tracker-dashboard` branch.** It widens
  `INTERNAL_API_SECRET` from one tightly-scoped route to a shared key across routes on four apps.
  The brief is explicit that it is scoped to `/api/draft` and "never a blanket auth bypass". This
  is an architecture change to the auth story, not a feature. Green CI is not sufficient to merge
  it — it comes to Joel with a recommendation first.
- **2026-09-11 — The `coffee` branch's naming proposal.** It rewrites the Domain Map to bare names
  (`editor`, `coffee`) and states a convention the live account contradicts. Decision: the `tp-`
  prefix stays, the table was corrected instead, and that branch should drop its naming section
  before merging.
