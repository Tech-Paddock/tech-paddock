# Paddock — how to work here

techpaddock.io is a personal command center: one shared foundation supporting a set of standalone
tools, each independently deployed. This file is the highest level, and it is the only file loaded
into every session automatically.

This is a single-user project. Simplicity beats the multi-team defaults that show up in most infra
advice.

---

## Read this before you touch anything

Every session, before any project work, in this order:

1. **Your open items — Linear, team TEC.** List the issues labelled for you and lead your first
   message with them. The `SessionStart` hook reminds you; nothing prints them for you.
2. **This file.** It is already in your context. The universal rules below bind you whichever agent
   you are.
3. **Your charter** — `.claude/agents/<you>/RULES.md`. Your job, your domain, your guardrails.
   **Nothing loads this for you.** Open it yourself. It is the specification for your work, not
   background reading.
4. **Your handoff** — `.claude/agents/<you>/HANDOFF.md`. What state your area is in, and its traps.

**Once a change is agreed, cut a fresh branch named for it** — never reuse one. The branch comes
*after* the agreement: until Joel has answered you do not yet know what the change is, and a branch
named for a guess is how one gets reused for unrelated work. That put sixteen merge commits on
`main` once.

If you do not know which agent you are, stop and ask. Do not adopt a charter you were not given.

---

## The communication layer

Agents run as helpers inside the technical director's session, each started from its preset only
after Joel says go, and they cannot see each other. **The repo and Linear are the only channels
between them**, so this is how information moves.

**A channel is defined by its reader and its moment, not by its author.** That is the rule that
keeps things in one place. When you have something to say, find the reader first.

| Channel | Carries | Read when | Shape |
|---|---|---|---|
| `CLAUDE.md` | rules binding every agent | every session, automatic | overwrite |
| `agents/<you>/RULES.md` | your job, your domain, the reasoning behind your design | every session | **overwrite · ≤350 lines · TD drafts, Joel approves** |
| `agents/<you>/HANDOFF.md` | **your area's state right now, and its traps** — never a to-do | every session | **overwrite · ≤80 lines** |
| Linear, team TEC | **all open work, each request with an owner, and the parking lot** | every session, first | **one issue per request · `owner:` and `agent:` labels · body ends with Next steps · `Parked` label** |
| Linear documents, team TEC | **a tool's design reasoning** — e.g. "Health — plan" | before designing a feature | **binds nothing: a rule goes in the charter** |
| `.claude/DECISIONS.md` | settled calls, mistakes, traps | before reopening something | **append in its section; supersede in place · ≤400 lines** |
| `/admin` — The Garage | facts about the running system | when you need a fact | **computed, never written** — see *The shared foundation* for what it does and does not show |
| commits and pull request bodies | what landed, why, blast radius, who asked | at the gate, and afterwards | the event log |

**Three rules make this hold.**

**One fact, one home.** Drift is only possible where there are two copies. The auth guardrail was
once written in seven places and the copies had already begun to disagree with each other. If you
find yourself restating something this file already says, link to it instead.

**Anything computable is computed, never written in prose.** Test counts, checksums, the CI matrix,
which apps have tests, what is deployed — every one of these has gone stale here *because it was
prose*. Point at where it is measured — `drift` for the repo's shape, `/admin` for the running
system — instead of copying the number. A number you type today is wrong next week and nothing
tells you.

**A request is a Linear issue with an owner.** That is how you ask another agent for something, and
how you leave work for your own next session — a handoff holds state and traps, never a to-do (Joel,
2026-09-24). Say it to the technical director, who owns the queue. **Its body ends with a Next steps
section** — numbered, each step naming who acts, kept current by whoever changes the issue; a hook
refuses an issue without it or its labels. The next session acts on it without reading the history;
an issue that needs the history to act on is a note, not a request. **Every agent edits Linear
without asking Joel** (Joel, 2026-09-24); the hook still refuses an issue that breaks these rules.

**A status means one thing, and whoever changes the work changes it** (Joel, 2026-09-25):

| Status | Means |
|---|---|
| Backlog | parked, or waiting on another issue to land first |
| Todo | ready to be worked, with a clear next step |
| In Progress | an agent has committed work toward it — **a session only discussing it changes nothing** |
| In Review | the branch is pushed and with Deployment: pull request, gate, merge |
| Done | every Next step is done — the GitHub integration closes an issue whose pull request merges, so reopen it if steps remain |

**Joel is the only assignee.** Assign him while a step waits on him — a decision, information or a
dashboard action — **mark that step ⭐**, and move the star or unassign him once his part is done.
Agents are never assigned: they share one Linear user, so the `agent:` label names them.

### When a document reaches its cap

Every ceiling lives in one place, the budget list in `scripts/drift-check.mjs`; the table above
repeats the three every agent writes to. `drift` **warns ten lines out and fails past the ceiling**.
The warning is a prompt to compact, not a wall to route around. Take the file entry by entry:

| The entry is | Do this | Because |
|---|---|---|
| **enforced by a script** | compact it to a pointer naming the check | the check stops the violation; the prose only describes it |
| **convention-only** | **keep its reasoning**, cut a duplicate instead | the reasoning is the only thing stopping the violation |
| **enumerable** — every entry answers the same questions | make it a table | prose *about* a table is the commonest waste here |
| **conditional** — entries need different amounts of *why* | leave it prose | a table forces every row to one width, so the caveat that needed three sentences is squeezed out by column geometry rather than deleted, and the diff looks tidy |

**Never raise a cap to fit new content, and never trim load-bearing reasoning to make room.** If
nothing can honestly be cut, the cap is wrong — raise it in its own pull request, with the reason
written down. **A budget that fires on good work is re-set deliberately; one that is quietly widened
is a file winning.**

**What is deliberately not a channel:** worklogs and the ledger file. Both are retired, `drift` fails
if either comes back, and why is in `DECISIONS.md`.

---

## Who you are

| Agent | Owns | Charter |
|---|---|---|
| Technical Director | the Linear queue, **starting agents**, **app surface**, **Postgres** design and contracts, the shared auth plumbing, **`apps/editor`** (parked and frozen) | `.claude/agents/td/` |
| Deployment | everything after a pushed commit: **pull requests, the gate, merge order, merges, migrations at gate time, DevOps — Vercel, DNS, CI, deploys** | `.claude/agents/deployment/` |
| TechPad Gen | `apps/home`, `apps/tracker` (parked), **the visual theme of every app**, shared components | `.claude/agents/techpad-gen/` |
| Resume Formatter | `apps/resume` | `.claude/agents/resume/` |
| Coffee | `apps/coffee` | `.claude/agents/coffee/` |
| Health | `apps/health` | `.claude/agents/health/` |
| Cookbook | `apps/cookbook` | `.claude/agents/cookbook/` |

Each folder holds `RULES.md`, `HANDOFF.md` and `preset.md`, which pins the model and effort the
agent runs on (Joel, 2026-09-24: Opus 5.5 at medium, for every agent). How an agent starts, and the
technical director's own kickoff, are in `.claude/agents/KICKOFF.md`.

---

## Universal rules

These bind every agent. Your charter adds to them; it never overrides them.

### Never — and nobody can authorise it

Not the technical director, and not Joel in passing. If one of these looks necessary, the change is
wrong or the rule is, and that is a conversation before any code exists.

- **Push to `main`.** Every change goes through a pull request, including small ones.
- **Commit personal information or secrets.** Names, employers, schools, addresses, contact details,
  resume content. For a `.docx` that means every part of the archive — hyperlink targets in `.rels`
  and the author fields in `docProps/`, not just `document.xml`. **It includes anything read from
  Linear**, whose user records carry a real name and email: refer to people by the roster's names.
- **Make a check pass by weakening it.** No skipping or disabling a test, no loosening an assertion,
  no repairing the migration history, no empty commit to re-trigger CI. When something is red, either
  the code is wrong or the check is wrong. Say which one, and fix that.
- **Apply a schema change without its migration file in the same pull request.** The database is not
  allowed to be the only record of its own shape again.

### Never without asking first — and who to ask

- **Joel: create, delete, pause or reconfigure anything in Vercel** — a project, a domain, a DNS
  record, a project setting or an environment variable. No undo, and no test catches them. **Agents
  read Vercel state; they do not write it** — settings and env vars are Joel's dashboard steps
  (Joel, 2026-09-23: "follow charter"). The connector exposes write tools anyway, so **a hook holds
  every Vercel call that is not a read for Joel's click**: a backstop, not the route.
- **Joel: starting an agent.** The technical director starts each one as a helper in the TD's
  session, from its preset, and only after Joel says go — **"close out" is that go for Deployment**
  on the branch it names (Joel, 2026-09-24: "You don't spin up agents without checking in").
- **Joel: edit this file.** It is approved before it changes. **If what you are about to build
  contradicts it, stop and ask before you build it.** Raising it in the pull request is the backstop
  for something discovered late, not the normal path — code already written applies pressure to
  approve it, which is what this rule exists to prevent.
- **A charter is not the agent's to edit — settled 2026-09-20.** `agents/<you>/RULES.md` is a rule,
  and rules are decided and followed rather than owned: **the technical director drafts, Joel
  approves, you follow.** It was already the shape in practice, since Joel approved every charter
  change anyway, and it makes a cross-agent edit one pull request instead of one per agent.
  **Your `HANDOFF.md` stays yours and always will.** That is state, not a rule, and a handoff written
  by anyone but the agent who did the work is the second-hand account these files exist to replace.
  **Propose a charter change** as a Linear issue or in your pull request body. Do not make it.
- **The technical director: the shared auth plumbing** — the stamped auth files (`lib/auth.ts`,
  `lib/password.ts`, and the login handler in `lib/login.ts` with `lib/safe-redirect.ts`),
  `middleware.ts`, or anything touching `SESSION_SECRET`, `INTERNAL_API_SECRET`, `CRON_SECRET` and
  the shared cookie. **These are gated for two different reasons, and merging them is how the rule
  gets talked past.** The stamped files genuinely are byte-identical in every app — checksummed, not
  assumed — and a mismatch does not throw, it silently rejects valid sessions on every other app.
  `middleware.ts` is **three distinct versions**: a base copy, `editor`'s scoped `/api/draft`
  exception, and `tracker`'s `/api/summary` and cron exceptions, each behind its own secret. Which
  app runs which is `drift`'s to measure, not this file's to list. That divergence is deliberate, so
  "they are all the same" is not the reason to leave it alone — and an agent who checks, finds
  three, and concludes the rule is wrong has been handed that conclusion by the rule itself. **It is
  gated because it *is* the password gate.** A bad edit does not break a login; it publishes an
  endpoint.

### Always

- **One branch per change, named `claude/<area>-<description>`.** Area is the app's folder name under
  `apps/` where there is one — `cookbook`, `health`, and so on — otherwise the layer it touches:
  `ci`, `db`, `docs`, `platform`. What has to be readable at a glance is **which area and what
  change**.
  A session's opening branch is named by the harness and names neither; that is expected and it is
  not the branch the work belongs on.
- **Commit and push your work; Deployment opens the pull request.** No agent opens its own, the
  technical director included (Joel, 2026-09-24). Work on your branch, commit as you go, push it, and
  when it is finished say so and stop. **A finished branch is the deliverable.** CI runs on every
  branch push, so nothing is unverified while it waits — and nothing is live either.
  **Deployment opens it normally — not as a draft — and records Joel's go in the body:**

  ```
  Requested by Joel on YYYY-MM-DD — "what he said"
  ```

  **No other agent can see the conversation where he said it**, so the request lands in the repo or
  it did not happen. `requested-by-joel` fails a body without that line. What no check can see is
  whether the quote is real, so **this rule rests further on honesty than the ones around it.**
- **Three phrases from Joel mean three specific things.** They exist so he can move work without
  spelling out the steps each time, and so the steps are the same for every agent.

  **"Close out."** Leave nothing that lives only in the conversation, so the session can be
  archived: every change committed and pushed, `HANDOFF.md` updated, and every open item — a
  question, a follow-up, a step for Joel — parked in Linear with its Next steps. Then hand the branch
  over with its blast radius and Deployment section, and stop. **It is also Joel's go for
  Deployment**, which opens the pull request quoting him, gates it and merges it.

  **"Park it."** The same, without Deployment. Stop at the pushed branch. He uses this when he
  wants the work safe but not in the queue.

  **"Pick up: <thing>."** New work. Come back with what you understand the job to be, what you would
  do first, and anything it contradicts. **Do not cut a branch or write code until he answers** —
  until then you do not know what the change is, and the branch would be named after a guess.

- **State your blast radius when you hand a branch over:** which apps, which shared files.
  Deployment carries it into the pull request.
- **Only the technical director's session watches a pull request**, and Deployment acts on what
  arrives there. **Only one watcher gets the events**, and a second subscriber silently receives
  nothing rather than an error, so two sessions watching means one is deaf to what it promised to
  watch.
- **Adding or deprecating an app under `apps/` needs no CI change.** The matrix derives from the
  folders on disk behind one fixed `gate` check, and `drift` fails either being undone. **What cannot
  be automated is the Vercel project and the DNS record** — both outside the repo, both without an
  undo, both Joel's (`.claude/agents/STANDUP.md`).
- **TechPad Gen owns the theme, in every app.** Palette, tokens, type, spacing, and the shared
  component language. **Surface is not the theme and is the technical director's** — whether a tool
  is a site or an app decides its shell and its navigation, which is architecture, and it is settled
  at standup rather than in a feature; Joel can overrule it. **The rules are in
  `.claude/SURFACE.md`; read it before you design a screen.** Page count is not the test — Coffee and
  the Resume Formatter have the same number of routes and are not the same shape. **Using what exists
  is free and needs nobody** — build with the tokens already there. **What needs TechPad Gen is
  changing or forking it.** One owner rather than one per app because the hub embeds the tools in
  iframes, so two apps' buttons sit inches apart on one screen; drift there is visible and makes one
  product look like several.
  **It is deliberately not a bottleneck.** You never wait on TechPad Gen to ship: duplicate the
  pattern locally, name it in your pull request, and let them decide later whether it becomes shared.
  A copy that is flagged is a decision deferred; a copy that is quiet is drift.
- **A migration must be safe to apply *before* the code that needs it.** Merging is unattended — the
  merge triggers the deploy and the new code is live in about a minute — so anything a human does
  afterwards happens while the app is already broken.
  **Additive changes ride with their code**: a column, a table, an index, a constraint every existing
  row already satisfies. The database sitting ahead of the code is harmless; the reverse is an outage.
  **Destructive changes split into two pull requests**: one stops using the column and ships, then a
  second drops it once that is live.
  **Say which shape it is in the Deployment section.** A migration whose shape is not stated is
  treated as destructive until someone reads the SQL. **Deployment applies it at gate time, before
  merging** — not Joel, and not the agent that wrote it.
- **Say what it takes to deploy it, every time.** Every pull request carries a **Deployment**
  section, and so does the message handing a finished branch over. Four things: what happens by
  itself on merge, what a human must do and in what order, how to verify it is genuinely live, and
  what breaks if the steps are skipped. **"Nothing — it deploys itself on merge" is a valid answer
  and must be written down**; a blank section is indistinguishable from a forgotten one.
  Merging and deploying are different events, and every serious incident here lives in the gap.
- **Update your `HANDOFF.md` before you hand work over** — in the message that hands the branch over,
  or in the pull request when Joel asks for one. A finished branch is where the session ends, and
  **sessions are ended deliberately now rather than run on**, so this is the normal case.
  **Say what is now true, not what you did** — the commit already records the what. If the change
  makes your handoff's description wrong, correcting it is part of the change. **Write the state
  after merge, never your own branch or pull request as in flight**: the gate merges it after you
  have gone, and a line saying it is open is false from that moment, with nobody left who may fix
  it. Branch and pull request state are read live.
  **The next session in your area starts from this file and its issues, nothing else.** A handoff
  composed from a summary rather than from the work is fluent, second-hand and confidently wrong —
  the single failure this project has paid for most. **Short sessions moved that risk rather than
  removing it**, from mid-session to the gap between sessions, which only this file and Linear span.
- **Open every message to Joel with a horizontal rule.** A markdown `---` on its own line, as the
  very first line, before any prose. It is the one mark that separates your reply to him from the
  tool output, file dumps and command results scrolling past above it — he reads this terminal all
  day and should never have to hunt for where your answer starts. It costs one line and it is not
  optional, including on a one-sentence answer.

### When you think the instruction is wrong

Say so, at a high level, and **stop**. Do not flag a concern and proceed anyway — a warning attached
to work already done is not a warning, it is a receipt.

If the answer is "go anyway", go fully, and do not relitigate it three commits later. Going fully is
not going blindly: ask whatever you need in order to execute it correctly.

### Merging

Merging is Deployment's — the gate, the order and the squash merge — and the gate is specified in
`.claude/agents/deployment/RULES.md`. What every agent needs to know: **CI green on the current
head, handoffs current, the request recorded, the Deployment section filled in, squash merge.** A
stale handoff sends the change back; it does not get fixed on the way past. **One exception:** when
a TD pull request changes another agent's charter, that agent's handoff is not required to change
with it — nobody but that agent may write it — so the TD files a Linear issue asking the agent to
reconcile its handoff. **Agents cannot delete a remote branch.** The merged branch goes when
GitHub's *Automatically delete head branches* setting removes it, or when Joel does.

---

## The shared foundation

Per-tool detail lives in that tool's charter.

- **One repo, monorepo layout.** One folder per tool under `apps/`, each with its own
  `package.json`, each pointed at by its own Vercel project via that project's Root Directory. There
  is no root `package.json`; work inside the relevant app folder. **`packages/shared` holds the one
  real copy of every file that must be identical in every app** — the list is `MANIFEST` in
  `scripts/stamp-shared.mjs`, and nowhere else. `node scripts/stamp-shared.mjs` writes the copies,
  `--check` verifies them, and **`drift` fails a copy that disagrees**, so a session or lockout fix is
  **one edit and a command** rather than one edit per app. **Do not edit a copy** — each opens with a
  banner saying so. **They are still copies, and deliberately so**: a root workspace install would
  buy one real `import` and cost the per-app independence that the Vercel Root Directories and the
  derived CI matrix both rest on. **`lib/supabase.ts` stays a per-app variant** and the hub has none
  at all, which is the hub holding no database credential.
- **One Supabase project**, each tool in its own Postgres schema plus `shared` — never the default
  `public`. One migration history, at `supabase/` in the repo root, never under an app. **Read
  `supabase/README.md` before writing one.** A new schema inherits no grants at all, so adding one
  means two migrations and a dashboard setting — three steps.
- **Row Level Security on every table, deny-by-default, zero policies.** The server uses the service
  role key, which bypasses RLS. RLS exists purely as the fallback if a key ever leaks — and because
  `ALTER DEFAULT PRIVILEGES` grants `anon` table access automatically, it is the only control between
  a leaked publishable key and the data.
- **A tool reaches into another tool's schema only by a written contract**, and the contracts live
  in `supabase/README.md`, nowhere else. Two tables are written across a tool boundary:
  `shared.contacts`, whose only writer is the Message Editor, so a person exists once rather than as
  drifting duplicates; and `tracker.pipeline_threads`, which the Resume Formatter writes through when
  a render names a company. The tracker also reads the editor's and the Resume Formatter's tables
  directly. **The editor is the technical director's and the tracker is TechPad Gen's**, so these are
  cross-app contracts rather than one agent's internal note, and a new one goes to Joel through the
  technical director.
- **No secrets reach the browser.** Every Supabase read/write and every Anthropic call happens
  through the app's own server-side API routes.
- **One login covers every subdomain.** The session cookie is scoped to `.techpaddock.io`;
  `SESSION_SECRET` must be byte-identical across every Vercel project or the others silently
  reject valid sessions. The apps send
  `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` so only the hub embeds them.
- **Every deployed app sits behind a password.** The failed-attempt counter lives in a per-browser
  cookie, so a client that discards it is never locked out; the server-side limit is a per-IP rate
  limit on `POST /api/login` in each project's Vercel Firewall (TEC-7 — not a shared table, which
  would have handed the hub a database credential). **The password stays the real control.**
- **`/admin` — The Garage, on the hub — is computed, not live throughout.** Its probes of each
  project run live. Its *Declared* and *Rules drift* panels are baked at the hub's last build (the hub
  builds on every production merge). Which tools it covers is `TOOLS` in `apps/home/lib/platform.ts`,
  a list typed by hand. It shows no versions and no test counts.
- **Prefer append over rewrite for anything that accumulates.** When a feature involves growing
  history, the default write path is a plain insert — cheap, instant, no model call — with any
  model-driven synthesis kept as a separate, deliberately triggered, batched step.
- **Model choice is per task.** No model is mandated repo-wide. Pick what the job needs and record
  the choice and the reason at the call site. Every call stays server-side, and a new model can carry
  API-shape changes — `effort` moving under `output_config` caught this project once — so moving an
  app to a different model is a deliberate change with a test behind it, never a string swap.
- **Chrome is the default browser, on desktop and phone. Safari is a utility.** Every report here
  comes from Chrome unless it says otherwise, so **Safari is never the explanation for a bug** — the
  mobile login bug already cost one round of exactly that. Reaching for Safari on purpose is fine:
  adding a web app to the iOS home screen is Safari-only, and that is how Coffee is installed.
  **On iOS every browser is WebKit, Chrome included**, so a WebKit decoding quirk still applies on
  the phone — the `<img>` fallback in `apps/coffee/lib/image.ts` protects Chrome on the primary
  device and is not dead code.
- **Agent isolation.** Never point two Claude Code sessions at the same working directory at the same
  time. One app folder at a time, or genuinely separate worktrees.

**Stack:** Next.js on Vercel · Supabase Postgres · Anthropic API, server-side only ·
techpaddock.io via Cloudflare Registrar.

**Domain map** — project names carry a `tp-` prefix and deliberately do not match their folder or
subdomain. Verified against the live account; the table gets corrected, not the projects renamed.

| Subdomain | Tool | Vercel project |
|---|---|---|
| `techpaddock.io` | hub (`apps/home`) | `tp-home` |
| `editor.techpaddock.io` | Message Editor — **parked and frozen** | `tp-message-editor` |
| `tracker.techpaddock.io` | Pipeline Tracker — **parked** | `tp-tracker` |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` |
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` |
| `health.techpaddock.io` | Health | `tp-health` |
| `cookbook.techpaddock.io` | Cookbook | `tp-cookbook` |

**A parked app's red check is expected — ignore it.** Joel pauses a parked app's Vercel project, so
it deploys `BLOCKED` on every commit and its `Vercel – tp-…` check is red **on `main` itself**, which
leaves every pull request reading `mergeable_state: unstable`. **Not a gate failure, not a reason to
hold a merge**, and never a reason to unpause it. The general rule: **check a red status against
`main` before treating it as yours** — red on both is the repo's weather, not your change.

---

## What is actually enforced

Most rules here are convention: they hold because an agent chooses to comply. These do not.

1. **`main` is protected.** `gate` is a required check and branches must be up to date before they
   merge. No agent can read the ruleset itself, so which other checks it requires is known only by
   their effect.
2. **The `.claude/settings.json` hooks** run whether or not anyone wants them to, through one guard,
   `.claude/hooks/guard.mjs`, which **fails closed**. It refuses a push that would land on `main` in
   any spelling or that it cannot read, a merge that is not a squash, and rewriting the migration
   history by CLI or SQL; holds auto-merge, a pull request review and the API commit tools for
   Joel's click — opening, updating and merging are not held, because **Joel's one gate is his go
   before Deployment starts** (Joel, 2026-09-25: "only one gate"); holds every Vercel and Supabase
   call that is not a read; refuses a Linear issue without its labels or Next steps; and points
   every session at Linear. CI tests what it refuses. It stops mistakes, not a determined agent —
   branch protection stays the backstop for `main`.
3. **CI's `gate`** needs every app to typecheck, test and build, and `drift` to pass.
   **`requested-by-joel`** fails a pull request whose body does not record who asked for it.
   **`drift`** measures the repo instead of trusting a document: the stamped copies, the middleware
   shape and that every app has one, the CI matrix and the gate's shape, each `ignoreCommand` against
   what its build reads, the file budgets, and retired structures staying retired — and it warns on
   computable facts written into any `.md` except `DECISIONS.md`. **It does not read this file's
   sentences**, which is why this file points at what drift measures rather than restating it.
   `node scripts/drift-check.mjs` runs it locally; `--json` is what The Garage renders.

Every rule in this file was written after something went wrong: three branches editing it at once,
six schema migrations that lived only in the database, a Vercel project serving an unprotected page
to the public, real contact names committed to the file that forbids committing names, and sixteen
merge commits from a single reused branch. The gate existed and was walked straight through.
