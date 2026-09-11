# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

Last reviewed: 2026-09-11

---

## Waiting on Joel

- **2026-09-11 — Is branch protection available on this account?** Settings → Branches. This is the
  hinge for everything else: without it, "no pushing to `main`" is a convention that an agent
  ignoring it will succeed at. The repo is private on a personal account, which may require a paid
  plan. Unverified — the API does not expose the plan.
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
- **2026-09-11 — Branch queue.** Merge order established and partly executed:
  `devops-merge-commits` (PR #16) → this ruleset → `this-n2kl8y` → `tracker-dashboard` → `coffee`.
  Delete `resume-formatter` (three days cold, 51 behind, conflicts) and `resume-editor-design-wccfly`
  (already fully merged, nothing on it).

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
