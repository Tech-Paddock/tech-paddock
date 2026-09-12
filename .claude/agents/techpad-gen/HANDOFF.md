# TechPad Gen — handoff

State as of 2026-09-12.

Read `RULES.md` first. This file is only what is true right now.

---

## What is on the branch, unmerged

`claude/techpad-gen-kickoff-qjnbws`, open as **draft PR #43**.

1. **`417dbdc` — the hub wears a John Player Special livery.** Near-black ground, gold accents, the
   four tiles on a gold ramp (champagne / gold / brass / bronze). This was a light-to-dark flip, so
   the token set was expanded until nothing colour-bearing was left literal. It reverts #19's
   accent-filled topbar deliberately: white on gold measures 2.42:1, gold on black 8.18:1.
2. **`9bd079e` — `/admin`**, a page showing what the repo declares against what the platform
   reports. Linked from the sidebar, behind the existing password gate.

Both were built and rendered locally. **The deploy outage is over** — previews build on this branch
and production is promoting again.

**This file deliberately does not name the commit production is serving.** An earlier version did,
and was wrong by the time it was read. At the point that was caught there were four documents each
naming a different production commit, every one correct when written: this branch said `92c1ec1`,
`main`'s copy of this file said `0c7d882`, the gate comment on #43 said `f06ff0c`, and the Vercel
account said something newer than all three. A commit SHA in prose is stale on the next merge, so
the only honest thing to write is where to look: the Vercel account today, or `/api/version` once
that exists (item 3 below). That is the same reason the `/admin` page computes rather than asserts.

Two changes share this branch because the session was pinned to it. The second extends the token
block the first created, so it reads as one "restyle the hub" branch rather than as reuse.

## What `/admin` is, and what it deliberately is not

`apps/home/app/admin/page.tsx`, `lib/platform.ts`, `lib/diagnostics.ts`,
`lib/declared.generated.ts`, `scripts/collect-declared.mjs`.

- **Declared** is generated from the repo at build time — `.env.example` names, the CI matrix,
  `supabase/migrations`. Variable *names* only; no value is ever read. Runs as `prebuild`, and is
  committed so `tsc` works on a clean checkout.
- **Reported** is probed live. `/login` is unauthenticated on all five apps, so fetching it proves
  DNS, TLS, Vercel routing and that Next booted — with no cooperation from the app and no new
  endpoint. Tracker's carved-out `/api/summary` is probed with the shared secret, which proves the
  hub and tracker hold the *same* `INTERNAL_API_SECRET`.
- **It never guesses.** Anything unreachable reads "unknown" with the reason. The page carries its
  own Blind spots section saying what it cannot see.
- **The hub is not probed over the network.** If the code is running, the hub is serving.
- It holds no key and reads no schema. Every property in `RULES.md` is intact.

**It is not a place anything is typed.** That was the central decision and it should survive
whatever gets built next: a page agents write config into is a second source of truth, and this
project has already been injured twice by exactly that — six migrations that lived only in the
database, and a ledger asserting a deployment state nobody re-verified.

---

## For Joel to take to the technical director

Everything below is outside what this agent may do alone. Nothing here has been started.

### 1. Do NOT create a new Vercel project or DNS record for the admin page

**`/admin` needs neither.** It is a route inside `apps/home` and ships with the hub on the next
deploy — no new project, no new subdomain, no new environment variable.

If `admin.techpaddock.io` is wanted anyway as a separate app, the real cost is:

- a Vercel project and a Cloudflare record, both of which `CLAUDE.md` flags as having no undo
- `apps/admin` added to the CI matrix in the same pull request — the matrix is hardcoded to five
  names and silently skips anything else
- `build (admin)` added to branch protection's required checks, which is already one short
- a **sixth** copy of `lib/auth.ts`, `lib/password.ts` and `middleware.ts` — the first two are
  genuinely identical across the five, so a sixth makes the project's largest latent risk larger
- `SESSION_SECRET` byte-identical again, plus `APP_PASSWORD_HASH` and `INTERNAL_API_SECRET`

Recommendation: keep it at `techpaddock.io/admin`. **If the goal is seeing the platform when the
platform is down, a sixth Vercel project does not achieve it** — it shares the account, the gate
and the deploy pipeline. That job needs something outside the platform entirely: an external
uptime monitor. Note it cannot reach `/api/health` today, which sits behind the password gate.

### 2. Make the tools answerable — needs the TD, then three agents

The page reports unknowns because it cannot see inside any app. To close that:

- **`/api/health` in `editor`, `tracker` and `home`.** `resume` and `coffee` already have one.
  Each is that app agent's own work; `apps/coffee/app/api/health/route.ts` is the pattern.
- **A middleware carve-out for `/api/health` in each app**, exactly like tracker's existing
  `/api/summary` one. This is shared auth plumbing — the TD's, and not any app agent's to do
  unilaterally. Without it the hub gets 401 even where the route exists.

Scope it as one change per app so the carve-outs land reviewed rather than copied in a hurry.

### 3. A public `/api/version` per app — the highest-value item on this list

One line returning the deployed commit SHA, unauthenticated. It would have made the three-hour
deployment outage visible in seconds instead of being found by reading build logs. Vercel exposes
the SHA to the app itself, never to a sibling, so nothing else can show deploy drift.

Decide whether it is public (so an external monitor can read it) or behind the internal secret.
Public exposes only a commit hash of a private repo; that is the trade.

### 4. Whether `/admin` replaces the pit-wall artifact — and how agents leave notes

Joel wants the page to carry agent notes and work updates. **The files agents already maintain are
the right source**, for the same reason the config column is generated: `_open-items.md`, each
agent's `HANDOFF.md`, and the live worklogs. Rendering those makes the page the pit wall without
inventing a parallel system and without a new rule for anyone.

The TD needs to settle three things before this is built:

- **Latency.** Agents write to a *branch*; the page renders from a *deploy*. A note is therefore
  invisible until merged and deployed. Options: (a) accept it, and the page shows `main` only;
  (b) the hub reads `.claude/` from the GitHub API at request time, which shows unmerged branches
  but puts a read-only GitHub token in the hub — **the first key the hub would ever hold**, and a
  direct exception to a `RULES.md` property, so it is Joel's call and not a detail.
- **Lifetime.** A worklog dies with its branch, by rule. So notes meant to outlive a change have
  to land in a `HANDOFF.md`. Worth stating explicitly if the page renders both, or notes will
  appear to vanish.
- **Rendering.** Markdown in the hub means either a dependency or a build-time transform. The hub's
  runtime dependencies are `next`, `react`, `react-dom` and `bcryptjs` — nothing for presentation —
  so a markdown renderer would be the first dependency added purely to display something.

### 5. Two corrections — both now closed

Kept as a record of where they went, not as outstanding work.

- **`middleware.ts` is three versions, not five identical copies.** Raised from this branch,
  landed on `main` as **#47**, corrected in eleven places. The correction names the hazard the old
  wording hid: the file is gated because it *is* the password gate, so a bad edit publishes an
  endpoint rather than breaking a login. `lib/auth.ts` and `lib/password.ts` genuinely are
  identical. Nothing further needed.
- **`SESSION_SECRET` consistency can never be shown on a dashboard.** Nothing may echo it; the only
  safe signal is behavioural. The TD confirms the ledger already reads that way. Agreed, closed.

---

## Still open, not started

- **The hub's mobile login bug.** Opening a tool from an embedded tile re-triggers that app's
  login on mobile. The handoff's old suggestion — that the iframe points at a `*.vercel.app`
  preview URL — is **ruled out by the code**: `APPS` hardcodes the custom domains, and did at
  the commit production was pinned to during the outage. Cookie attributes are also sound on paper:
  `.techpaddock.io`, `SameSite=Lax`, which is same-site across subdomains and so not blocked. Both
  cheap explanations are gone, so this needs a live repro with devtools — **which is possible again
  now that deploys are flowing**, and was the thing blocking it.
- **`apps/home` still has no `test` script.** CI runs `npm run test --if-present`, so adding one
  opts the app in with no CI change. `lib/glance.ts` and now `lib/diagnostics.ts` are pure and
  untested. `editor` and `home` are the two apps without tests.
- **A "Pit Wall" style pass** was planned and not approved — a monospace stack, a type scale to
  replace ten ad-hoc pixel values, and collapsing the three drifted copies of the micro-label rule
  (`.eyebrow`, `.sidebar-label`, `.slot-label`). Joel deferred it; pick it up when he returns to it.
