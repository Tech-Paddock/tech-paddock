# TD handoff — state as of 2026-09-11, 19:00 UTC

Written by the outgoing TD session (`tech-paddock-79`), which lost GitHub access when the repo moved
to the `Tech-Paddock` org. Everything below is pushed and safe. Read `TD-ONBOARDING.md` first for
the role; this is the workload.

**Board:** https://claude.ai/code/artifact/9cac3618-1a51-4d5e-82fb-339e96657bf4 — deployments, CI,
branches and open items. Its GitHub data is frozen at 18:15 because I lost access; it says so on its
own face. Refresh it once you can read GitHub again.

---

## Do this first, in this order

**1. Merge PR #17.** It carries the Rules of Engagement, the worklog channel, and the Supabase
migration backfill. Until it lands, none of the rules exist on `main` and no restarted agent will
see them. It was deliberately not self-merged: those are the rules that constrain the TD, and the
TD approving them alone is the wrong shape.

**2. Verify branch protection actually bites.** It is configured and Active with an empty bypass
list. The settings page is not proof — attempt a direct push to `main` and confirm it is refused.
Report the refusal.

**3. Refresh the board.** Its GitHub half is stale.

---

## The merge queue

Order matters — these conflict with each other, not just with `main`.

| # | Branch | State | Notes |
|---|---|---|---|
| 1 | `claude/integrations-agent-architecture-2wcbpw` | PR #17, +3 | The rules. Merge first. |
| 2 | `claude/this-n2kl8y` | +4 / −1 | Home banner, logout, a known-issue note |
| 3 | `claude/tracker-dashboard-concept-r6p9up` | +7 / −3 | **Needs Joel — see below** |
| 4 | `claude/coffee-brewing-assistant-hmvffw` | +7 / −4 | Adds a fifth app |

**Delete, do not merge:**
- `claude/resume-formatter` — 3 days cold, 52 behind, conflicts on `CLAUDE.md`
- `claude/resume-editor-design-wccfly` — 0 ahead, fully merged already
- `claude/devops-merge-commits-ts7ohz` — squash-merged as #16

**Known conflicts, verified by simulating the sequence:**
- `tracker-dashboard` and `this-n2kl8y` both change `apps/home/app/page.tsx`. The dashboard branch
  rewrites it from a client component to a server component (`HomeShell` + `loadGlance`);
  `this-n2kl8y` adds a topbar subtitle to the version being deleted. Dashboard wins on structure;
  re-apply the subtitle on top, and tell that builder rather than silently dropping their work.
- `coffee` conflicts on `CLAUDE.md` — it rewrites the Domain Map. See below.

Branch protection requires branches to be up to date, so each merge invalidates the next. Expect
four sequential rounds with a CI run each.

---

## Blocked on Joel

- **Hooks: yes or no.** Two kinds, decide separately. Blocking `PreToolUse` hooks (refuse pushes to
  `main`, Vercel/DNS mutations, migrations with no checked-in file, PII patterns) — the only
  enforcement independent of GitHub. And a benign `SessionStart` hook that prints the ledger into
  every session automatically. The second is recommended and low risk; it blocks nothing.
- **`supabase link` and `migration list`, run once locally.** Three commands in
  `supabase/README.md`. Needs an access token no agent should hold. Expect six matching rows and
  `20260908235234` showing remote-only — that gap is deliberate, do not repair it.

---

## Flagged and stood down — do not merge without Joel

**The `/api/summary` fan-out** on `tracker-dashboard`. It has every tool expose a summary endpoint
and has the hub fan out server-side over `INTERNAL_API_SECRET`. Today that secret unlocks exactly
one route — editor's `/api/draft` — and the brief is explicit that it is "scoped tightly to that one
route, never a blanket auth bypass." This turns it into a shared key across four apps. It may well
be right, but it is an architecture change to the auth story, not a feature. **Green CI is not
sufficient.**

**The `coffee` branch's naming proposal.** It rewrites the Domain Map to bare names (`editor`,
`coffee`) and asserts a convention the live Vercel account contradicts — the real names carry a
`tp-` prefix. Decision already made: the prefix stays, the brief was corrected to match, and that
branch should drop its naming section before merging.

---

## Committed but not done

- **Node runtime drift.** CI pins Node 20; all five Vercel projects run 24; no `engines` field
  anywhere. CI can go green on a runtime that never ships. Fix: CI matrix → 24, add `engines` to the
  four `package.json` files. PR not opened.
- **PII scrub.** `"Attain"`, a real target company, sits in a UI placeholder at
  `apps/resume/app/page.tsx:389` and in five fixtures in `apps/resume/tests/persistence.test.ts`.
  Approved for removal. PR not opened.
- **Three branches to delete** once the queue clears.

---

## Known, deliberately not fixed

- **`tp-coffee-app`** — a fifth Vercel project created by Vercel's import-suggestion flow, Root
  Directory pointed at the repo root. It builds nothing and serves an empty page publicly at
  `tech-paddock.vercel.app`, outside the password gate — the gate lives in each app's middleware, so
  a project with no app has no gate. **Fix in place, do not delete** (Joel's call). Blocked until
  `apps/coffee` exists on `main`. Then: Root Directory → `apps/coffee`, framework Next.js, env vars.
- **No Ignored Build Step on any project.** Every push rebuilds all five. A docs-only commit
  triggered four full rebuilds during this session.
- **DNS wired two ways.** `editor` resolves through the modern `vercel-dns-017.com` target; the
  other three use the legacy `76.76.21.21` A record. Both work. Switching to CNAMEs is hygiene.
- **`/api/health` sits behind the password gate**, so no external uptime monitor can reach it.
- **`editor.model_status` has zero rows** — the login-time model drift check has never successfully
  written. Not diagnosed.
- **The board's wake subscription failed to register** (`mint_failed`). Nothing wakes on republish.

---

## Landed this session

- Supabase migration backfill — six migrations checked in at `supabase/migrations/`, verified
  against the applied remote history by normalized hash. Moved from `apps/resume/` to the repo root:
  one project, one history.
- `supabase/README.md` recording the deliberate seed-migration gap, the `anon` default-privileges
  trap, and the CLI workflow.
- Rules of Engagement in `CLAUDE.md`, plus the worklog channel and `read-all.sh`.
- PR #16 merged — the merge policy and PR template, with its premise corrected in the PR body.
- Domain Map corrected to the real Vercel project names; `position` added to the contacts table.
- The board.
