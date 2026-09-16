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

## The theme system — granted 2026-09-15, built 2026-09-16

**Status: live in all five apps.** `CLAUDE.md` names TechPad Gen the owner of *the visual theme of
every app* (#66), and `claude/ui-livery-themes` implements it. The ownership ask that used to fill
this section is answered and has been cut; what is kept below is the part that outlives it — the
assignment, why Silver Arrows was dropped, and the standing override.

**What shipped.** Ten palettes, five liveries, both polarities each, and the light/dark switch in
every header with the livery name and what it is drawn from. 290 contrast pairs, 0 failing.

**Where the mechanism lives.** `lib/theme.css` holds every token and is byte-identical in all five
apps, alongside `lib/theme.ts` and `app/ThemeControl.tsx`; `lib/livery.ts` is the one file that
differs per app and it holds a single constant. The four tools' `tailwind.config.ts` no longer
contains a colour — every entry reads `rgb(var(--token-rgb) / <alpha-value>)`, and the triplet form
is required rather than preferred, because it is the only shape Tailwind's alpha modifier can
interpolate.

**The one boundary this crossed, recorded so nobody has to reconstruct it.** The TD's note on #66
said moving colours out of `tailwind.config.ts` "cannot be TechPad Gen's first act under this
rule", and his ledger carries it as an open question of who should do it. It was this agent, on
Joel's instruction, because there is no way to theme a Tailwind app without it: `bg-paper` compiles
to a literal hex and no stylesheet can reach it afterwards. Said in the worklog and the pull request
too, not only here.

### Why it needed the rule first

`apps/home` could always have taken a theme: every rule there already read through `var()`. The
four tools could not. They were Tailwind with colour compiled in at build time, so converting them
meant editing `tailwind.config.ts`, `globals.css`, `layout.tsx` and the colour classes **inside
four other agents' folders** — which `RULES.md` permits only as a declared exception, not as
ownership. #66 is what turned that from an exception into the job.

### The assignment Joel settled on 2026-09-15

**One livery per app, both polarities each, and the light/dark toggle lives in every app's header.**

| App | Livery | Slugs |
|---|---|---|
| Hub and `/admin` | Martini | `martini-light` · `martini` |
| Message Editor | **Clark** | `clark-light` · `clark` |
| Pipeline Tracker | Senna | `senna-light` · `senna` |
| Resume Formatter | MP4/4 | `mp44` · `mp44-dark` |
| Coffee | John Player Special | `jps-light` · `jps` |

**This replaces the platform-wide picker that the earlier plan assumed**, and it is simpler in every
direction. The livery is fixed per app, so it is a build-time constant rather than a cookie, and the
root layouts do not need `cookies()` for it and stay statically rendered. The iframe mismatch stops
being a defect and becomes the design: a Martini hub framing a Clark editor is intentional.

What still needs to be shared at runtime is **polarity only** — one cookie carrying
`light` / `dark` / `system`, scoped `.techpaddock.io` so toggling in Coffee also flips the hub. Far
less machinery than a full theme cookie: `[data-livery="martini"][data-mode="dark"]`, with `system`
stamping no mode and letting `@media (prefers-color-scheme: dark)` supply the dark tokens. No
blocking script, no flash.

**Silver Arrows was dropped on 2026-09-15** over the 1955 Le Mans disaster — Levegh's Mercedes
300 SLR disintegrated into the crowd, 83 spectators killed plus the driver, and Mercedes withdrew
from racing entirely. **Clark replaces it**: the Lotus 25 in British racing green with the yellow
nose stripe as the accent. Calm and legible, which is what a tool you write long text in wants.

**The rule, in Joel's words on 2026-09-15, because the first version written here was wrong.**
He is *fine with liveries tied to dead racers* — Senna stayed, and Villeneuve, Peterson and Rindt
are all in the book. A blanket no-dead-drivers rule would take JPS too, since Ronnie Peterson died
in a Lotus 79's sister car at Monza in 1978, and it is not what he meant.

**Two things disqualify a livery: mass casualties, and a regime.** Silver Arrows failed both.
Le Mans 1955 killed 83 spectators. And the name is not the 1954 car's — it belongs to the 1934-39
Mercedes and Auto Union teams, funded by the Nazi state at around 450,000 Reichsmarks a year and run
as a propaganda demonstration of German technical supremacy, with swastikas on the cars.
Daimler-Benz also used tens of thousands of forced labourers during the war. The W196 is post-war
and not itself implicated, but it took the name and the myth on purpose, so the association travels
with it.

**What this filter actually catches in the current book: nothing else.** Auto Union and Porsche are
absent. Rosso Corsa predates fascism by decades and is a national colour, not a team. The one thread
worth naming so nobody rediscovers it: **Fangio's early career in Europe was funded by Perón's
government.** That is a real fact and a thin one — he was apolitical and is universally admired —
so he stays unless Joel says otherwise.

**Three palettes were built for this assignment and did not exist before it**, because every
assigned livery needs both halves: **Senna light**, **MP4/4 dark**, and **Clark** in both (Silver
Arrows dark was built too and is now unused, retired alongside the rest of the exploration). All
three passed the 29-pair gate first time; two needed their hairline lifted to the shipped 1.82:1
bar. Senna light is arguably the truer Senna — the helmet is a yellow ground with the chevrons on
top, so the dark version is the one that inverts it.

All five apps had a `<header>` already, so the control had somewhere to go in each.
**`apps/resume` needed no restructure after all** — it is `flex flex-col` where the others are
horizontal, and the control simply sits under the description line rather than beside the title.
That was flagged here as a risk before the work and turned out not to be one.

**What goes in the header's right-hand slot**, settled 2026-09-15 and the same in all five apps:

```
                              MARTINI            ☀ ☾
                       Brabham BT44B, 1975
```

The livery name in `--accent`, uppercase, 11px; the inspiration beneath it in `--ink-soft` at 10px;
then the two-state light/dark control. Both states stay visible so it reads as a choice rather than
a button whose meaning depends on the state it is currently in.

**The inspiration string is not the palette's `source` field.** That is written to be read in a spec
line and runs too long for chrome — Martini's is three cars. The short ones shipped in
`lib/theme.ts`: Brabham BT44B, 1975 · Lotus 25, 1963 · Ayrton Senna's helmet · McLaren MP4/4, 1988 ·
Lotus 79, 1978. Below 560px the line is hidden entirely and only the livery name stays, because on a
phone all three parts together pushed the app's own title into a corner.

No new contrast pairs: the name reuses accent-on-paper and the active toggle segment reuses
accent-on-`--surface-raised`, both already in the 29-pair gate.

### What the grant covers, now that it exists

Themes reach `app/globals.css`, `tailwind.config.ts`, the `<html>` attributes and viewport export
in `app/layout.tsx`, the colour-bearing utility classes, and the new `lib/theme.*` files. They do
**not** reach `middleware.ts`, `lib/auth.ts`, `lib/password.ts`, `lib/supabase.ts`, or any API
route, and the implementation touched none of them — verified against the diff rather than asserted.
A grant wider than the job is how a gate gets talked past later.

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
entire content difference from the rebuilt remote was those three `apps/tracker` files.

### The test, and what #68 did to it

The test used to be `git diff origin/main <branch> -- apps/tracker` coming back empty. **That no
longer discriminates, and #68 is why.** The theme system added `lib/theme.css`, `lib/theme.ts`,
`lib/livery.ts` and `app/ThemeControl.tsx` to every app and rewrote the colour classes, so *every*
branch cut before 2026-09-16 now differs under `apps/tracker` whether or not it carries anything
sensitive. Run against the five stale branches in one container it flagged all five, including two
that were provably clean — a test that answers yes to everything answers nothing.

Three files are the actual signal, because they are the three the scrub touched. Narrow to them:

```
git diff --name-only origin/main <branch> -- \
  apps/tracker/lib/matchMeetings.ts apps/tracker/tests/
```

Empty means clean. Non-empty means the branch still carries the entities: do not push it and do not
cherry-pick from it.

**Pushing one under its own name is the worst case, not the safest.** Those remotes are deleted, so
a push does not update a branch — it *recreates* one, which is the resurrected-branch incident in
the ledger except that it republishes personal information. The trap has a name attached: the
harness opens a session on a branch like `claude/techpad-gen-kickoff-qjnbws` and the session prompt
names it as the branch to develop on. That branch was one of the three carrying un-scrubbed
fixtures. `CLAUDE.md` already says to cut a fresh branch once the change is agreed, and following it
is what avoids this — the kickoff branch is not the branch the work belongs on.

**Cleared on 2026-09-16.** All five stale local branches were deleted and local `main` — stranded 56
commits back at #32 on pre-rewrite history — was reset to `origin/main`, on Joel's instruction. The
container now holds no ref carrying the un-scrubbed fixtures. This stays written down because the
next container starts from a fresh clone and the hazard returns the moment anyone revives an old
branch from elsewhere.

The rewrite also orphaned every original commit, so GitHub reports #43 and #51–#57 as
`merged: false` even though their content is plainly on `main`. That is cosmetic for those. It was
real for #58, whose content never reached `main` and rode into #59 instead.
