# TechPad Gen — handoff

State as of 2026-09-15.

Read `RULES.md` first. This file is only what is true right now.

---

## What is live on `main`

Merged as **`2be59b2`** (#43): the hub's John Player Special livery and the `/admin` page. **`fc9ec7f`**
(#54) then removed that branch's worklog, which the merge had orphaned.

- **The livery.** Near-black ground, gold accents, the four tiles on a gold ramp — champagne, gold,
  brass, bronze. A light-to-dark flip, so the token set was expanded until nothing colour-bearing was
  left literal. It reverts #19's accent-filled topbar deliberately: white on gold measures 2.42:1,
  gold on black 8.18:1.
- **`/admin`.** What the repo declares, against what the platform reports. Linked from the sidebar,
  behind the existing password gate. Described in full below.

**This file deliberately does not name the commit production is serving.** An earlier version did,
and was wrong by the time it was read. At the point that was caught there were four documents each
naming a different production commit, every one correct when written: this file's own copy on `main`
said `0c7d882`, the branch said `92c1ec1`, the gate comment on #43 said `f06ff0c`, and the Vercel
account said something newer than all three. A commit SHA in prose is stale on the next merge, so the
only honest thing to write is where to look: the Vercel account today, or `/api/version` once that
exists (item 3 below). That is the same reason the `/admin` page computes rather than asserts.

## The chrome is a layout, not a component inside one page

`apps/home/app/(shell)/` is a route group holding `/` and `/admin`. Its `layout.tsx` renders
`Chrome.tsx` — topbar, sidebar, and the `.content` box — with each page as `children`. Route groups
are invisible in the URL, so both routes are unchanged and existing links keep working.

**`/login` is deliberately outside the group.** It is the pre-auth page, and a sidebar there would
offer links the visitor cannot follow. That is why the chrome is not in the root layout, which
`/login` shares.

**`children` rather than props is what makes it possible at all.** `/admin` is an async server
component running live probes, so it can never be rendered *by* a client component — but it can be
passed *through* one.

`HomeShell.tsx` is gone, split into `Chrome.tsx` (chrome, plus the `APPS` list and the
tone-completeness check that fails the build when a tool has no colour) and `Landing.tsx` (glance,
tiles, iframe). Sidebar items are `Link`s reading `usePathname()` and `?app=`, so they work from
either route and the right one is active on both.

**The trap, before adding a third route here.** The shell was built around an iframe at
`height: 100%`, so nothing had ever needed to scroll and there was **no `overflow-y` anywhere in the
stylesheet**. A document-length page is not clipped by that — it escapes into *document* scroll,
dragging the topbar off the top while `.shell` stays capped at one viewport, leaving the sidebar's
surface ending partway down the page. `.content` now has `min-height: 0` and `overflow-y: auto`.

Measured rather than eyeballed, because this was the whole risk: scrolling `/admin` to its end moves
`.content.scrollTop` to 841 while `window.scrollY` stays **0**, the topbar stays visible, and the
sidebar's bottom edge equals the viewport height exactly.

## What `/admin` is, and what it deliberately is not

`apps/home/app/(shell)/admin/page.tsx`, `lib/platform.ts`, `lib/diagnostics.ts`,
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

## For the technical director — theme ownership, 2026-09-15

**Status: asked for by Joel, not yet written into any document. Until it is, this agent does not own
themes outside `apps/home` and has not acted as if it does.**

Joel asked the TD to update the markdown so TechPad Gen owns the theme system across all five apps.
It is recorded here because **he said he may have previously told the TD to undo it**, and because
nothing in the repo currently authorises it — which is the point. The repo is the only channel
between agents, so an instruction that lives in a chat nobody else can read did not happen.

### Why it is needed

A fifteen-theme system was designed and gate-passed on 2026-09-15 — 464 contrast pairs across the
29 places `globals.css` actually paints one token on another, 0 failing. `apps/home` can take it
with **no rule changes at all**: every rule there already reads through `var()`.

The four tools cannot. They are Tailwind with colour compiled in at build time — `bg-paper` becomes
`background-color: #FBF4EC`, not a variable — plus 69 literal `bg-white`, 23 `text-white`, and ~40
stock `red-*`/`amber-*` severity classes. Converting them means editing `tailwind.config.ts`,
`globals.css`, `layout.tsx` and colour utilities **inside four other agents' folders**, which
`RULES.md` permits only as a declared exception, not as ownership.

### Three edits, and the second is the one that gets missed

1. **`CLAUDE.md`, the "Who you are" table.** Extend the TechPad Gen row to `apps/home`,
   cross-cutting UI, shared conventions, **the theme system in all five apps**.

2. **The four tool charters.** Each currently assigns its agent a team livery — Scuderia red, Aston
   green, Silver Arrows, McLaren papaya. Ownership without a matching prohibition over there is half
   a rule: the next Coffee or Tracker session adds a hex, and a theme then breaks in one app only,
   so nothing tells anyone. Proposed wording:

   > **Colour is not yours.** Do not add a hex, a Tailwind stock colour utility (`bg-white`,
   > `text-red-800`), or a `theme.extend.colors` entry. Paint through the shared tokens. Needing a
   > colour that does not exist means asking TechPad Gen for a token, not inventing one.

3. **`CLAUDE.md`, the shared foundation.** `lib/theme.css` becomes a byte-identical five-way copy
   alongside `lib/auth.ts` and `lib/password.ts`. Drift here is visible immediately rather than
   silent, but it belongs written down beside them. With the warning that comes with it: **`paper`
   and `ink` mean near-white and near-black in the four tools and the exact opposite in the hub**,
   so unifying them inverts four apps at once. This app has already paid for that — `globals.css`
   still carries the comment about a token whose name survived a theme flip while its meaning
   inverted, painting black on black.

### What should *not* be granted

Themes need `app/globals.css`, `tailwind.config.ts`, the `<html>` attribute and viewport export in
`app/layout.tsx`, the colour-bearing utility classes, and the new `lib/theme.css`. They do **not**
need `middleware.ts`, `lib/auth.ts`, `lib/password.ts`, `lib/supabase.ts`, or any API route. Those
stay exactly as gated as they are. A grant wider than the job is how a gate gets talked past later.

### Joel's standing override, and the one condition on it

On 2026-09-15 Joel said he would rather grant override access case by case, with his explicit
permission, than write every boundary down in advance. **That works and this agent will act on it.**

One condition, and it is not this agent being cautious — it is the condition `requested-by-joel`
already enforces for the same reason: **the override gets recorded in the repo.** No other agent can
see the conversation where he grants it, and every agent acts as the same GitHub account, so an
override that exists only in chat is indistinguishable from an agent deciding on its own. One line
in the worklog and in the pull request body, the same shape as the request line:

```
Override granted by Joel on YYYY-MM-DD — "what he said" — permits: <the specific thing>
```

**What an override reaches:** jurisdiction — whose folder, who owns what. That is Joel's to give.

**What it does not reach:** the three machine-enforced gates. `main` is protected in the GitHub UI,
the `.claude/settings.json` hooks refuse a push to `main` and a `supabase migration repair`, and
`requested-by-joel` fails a pull request body with no request line. Those need the TD or a settings
change; permission in chat will not move them, and an agent that promises otherwise is wrong.

## Approved by Joel, 2026-09-12 — for the technical director to schedule

Everything below is outside what this agent may do alone, and **none of it has been started.** Joel
approved this list as a whole on 2026-09-12, so the next session inherits it as agreed rather than
as a proposal to re-open.

The scope below used to live in the worklog of the branch that carried #43, with this file holding
only a pointer to it.
**The worklog was then deleted with its branch (#54) and took the detail with it** — the pointer
outlived the thing it pointed at. It is inlined here instead, because the test of "move what
outlives the branch into the handoff" is whether this file still reads correctly once no worklog
exists.

**One thing the approval does not cover, and I am not treating it as covered.** Item 4 contains a
sub-decision about the hub reading the GitHub API at request time, which would put a **read-only
token in the hub — the first key it has ever held**, and a direct exception to a property `RULES.md`
tells this agent to protect. Joel approved the scoping list; he did not separately approve that.
Until he says it in those terms, the buildable version of item 4 renders `main` only and accepts the
latency.

### 1. Do NOT create a new Vercel project or DNS record for the admin page

**`/admin` needs neither.** It is a route inside `apps/home` and shipped with the hub — no new
project, no new subdomain, no new environment variable.

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

### 2. Make the tools answerable — needs the TD, then two app agents

The page reports unknowns because it cannot see inside any app. Two separate pieces of work, and
they are not the same people's:

**The carve-out is the TD's.** `middleware.ts` — the file gated because it *is* the password gate,
so a bad edit publishes an endpoint rather than breaking a login. The pattern already exists and is
reviewed: tracker's `/api/summary` bypass. Exact-path match, `x-internal-secret` header, fails
closed.

| app | has `/api/health` | needs a route | needs a carve-out |
|---|---|---|---|
| editor | no | yes | yes |
| tracker | no | yes | yes |
| resume | **yes** | — | yes |
| coffee | **yes** | — | yes |
| home | no | — | — |

**`resume` and `coffee` need only the carve-out.** Their routes are already written and are
currently unreachable from the hub, returning 401. That makes them the cheapest two to do first and
the cheapest proof the mechanism works end to end.

`home` needs neither: the hub reports on itself without a network call, deliberately.

**The routes are the editor and tracker agents' own work.** Pattern:
`apps/coffee/app/api/health/route.ts`. Each app reports on its own dependencies and the hub only
aggregates, so nothing in `apps/home` changes — `/admin` already renders whatever comes back, and
shows these as unknown with the reason until they exist.

One change per app rather than one change across four, so each carve-out is reviewed on its own.

### 3. A public `/api/version` per app — the highest-value item on this list

One line per app returning `VERCEL_GIT_COMMIT_SHA`, which Vercel exposes to an app but never to a
sibling — so nothing else in the platform can show deploy drift. It would have made the three-hour
deployment outage visible in seconds instead of being found by reading build logs, and it is what
would let this handoff name a production commit without the claim going stale.

**Decision needed: public, or behind the internal secret.** Recommendation: public. It exposes a
commit hash of a private repo and nothing else, and public is what lets an external monitor notice
an outage — the actual use case, since `/api/health` sits behind the password gate where no monitor
can reach it.

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

- **`middleware.ts` is three versions, not five identical copies.** Raised while building #43,
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
  `CLAUDE.md` now settles the browser question at brief level: Chrome is the default on desktop and
  phone, and **Safari is never the explanation for a bug**. So the WebKit/ITP theory is not merely
  unsupported here, it is ruled out — reproduce in Chrome and describe the behaviour as Chrome's.
  Note the same rule records that on iOS every browser is WebKit, so a decoding or rendering quirk
  still applies on the phone; it is cookie-policy theories that are out, not all WebKit behaviour.
- **`apps/home` still has no `test` script.** CI runs `npm run test --if-present`, so adding one
  opts the app in with no CI change. `lib/glance.ts` and now `lib/diagnostics.ts` are pure and
  untested. `editor` and `home` are the two apps without tests.
- **A "Pit Wall" style pass** was planned and not approved — a monospace stack, a type scale to
  replace ten ad-hoc pixel values, and collapsing the three drifted copies of the micro-label rule
  (`.eyebrow`, `.sidebar-label`, `.slot-label`). Joel deferred it; pick it up when he returns to it.

---

## Two things previously flagged to Joel — both now closed

**The brief's Coffee row.** `CLAUDE.md` said `coffee.techpaddock.io` was "built, not yet deployed"
while the ledger said it was fully up. Corrected on `main` in #61; the row now reads **live**. The
hub's Coffee tile was never wrong — the domain always resolved.

**Which workflow is in force.** Settled. `CLAUDE.md` now carries *"Commit and push your work. Do not
open a pull request until Joel asks for one"*, and `requested-by-joel` enforces the request line
server-side. The draft-pull-request convention #50 would have introduced is dead; #50 stays closed.

## The history rewrite of 2026-09-15 — read this before pushing any old branch

Moved here from the worklog of `claude/techpad-gen-admin-in-shell` before that worklog was deleted
with its merged branch. It is a safety fact, not a record of a change, so it outlives the branch.

`main` was **force-updated** (`1a40550...ab660ed`) to scrub seven real entities — five companies and
two people — out of `apps/tracker` fixtures. They were live in the working tree, not merely in
history.

**Any branch cut before that rewrite still carries the un-scrubbed files.** A local copy of
`claude/techpad-gen-admin-in-shell` was discarded rather than pushed for exactly this reason: its
entire content difference from the rebuilt remote was those three `apps/tracker` files. If you find
an old branch, do not push it and do not cherry-pick from it until
`git diff origin/main <branch> -- apps/tracker` comes back empty.

The rewrite also orphaned every original commit, so GitHub reports #43 and #51–#57 as
`merged: false` even though their content is plainly on `main`. That is cosmetic for those. It was
real for #58, whose content never reached `main` and rode into #59 instead.
