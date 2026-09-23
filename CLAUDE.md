# Paddock — how to work here

techpaddock.io is a personal command center: one shared foundation supporting a set of standalone
tools, each independently deployed. This file is the highest level, and it is the only file loaded
into every session automatically.

This is a single-user project. Simplicity beats the multi-team defaults that show up in most infra
advice.

---

## Read this before you touch anything

Three steps, every session, before any project work:

1. **This file.** It is already in your context. The universal rules below bind you whichever agent
   you are.
2. **Your charter** — `.claude/agents/<you>/RULES.md`. Your job, your domain, your guardrails.
   **Nothing loads this for you.** Open it yourself. It is the specification for your work, not
   background reading.
3. **Your handoff** — `.claude/agents/<you>/HANDOFF.md`. What state your area is in and what to do
   next.

**Open items live in Linear, team TEC.** A hook reminds you; nothing prints them for you. List the
ones labelled for you before anything else.

**Once a change is agreed, cut a fresh branch named for it** — never reuse one. The branch comes
*after* the agreement: until Joel has answered you do not yet know what the change is, and a branch
named for a guess is how one gets reused for unrelated work. That put sixteen merge commits on
`main` once.

If you do not know which agent you are, stop and ask. Do not adopt a charter you were not given.

---

## The communication layer

Agents here never run at the same time and cannot see each other. There is no way to ask another
agent anything. **The repo is the only channel**, so this is how information moves.

**A channel is defined by its reader and its moment, not by its author.** That is the rule that
keeps things in one place. When you have something to say, find the reader first.

| Channel | Carries | Read when | Shape |
|---|---|---|---|
| `CLAUDE.md` | rules binding every agent | every session, automatic | overwrite |
| `agents/<you>/RULES.md` | your job, your domain, the reasoning behind your design | every session | **overwrite · ≤350 lines · TD drafts, Joel approves** |
| `agents/<you>/HANDOFF.md` | **your area's state right now** | every session | **overwrite · ≤80 lines** |
| Linear, team TEC | **open requests, each with an owner** | every session, first | **one issue per request · `owner:` and `agent:` labels · body ends with Next steps** |
| `.claude/DECISIONS.md` | settled calls, mistakes, traps | before reopening something | **append in its section; supersede in place · ≤400 lines** |
| `/admin` — The Garage | facts about the running system | when you need a fact | **computed, never written** |
| commits and pull request bodies | what landed, why, blast radius, who asked | at the gate, and afterwards | the event log |

**Three rules make this hold.**

**One fact, one home.** Drift is only possible where there are two copies. The auth guardrail was
once written in seven places and the copies had already begun to disagree with each other. If you
find yourself restating something this file already says, link to it instead.

**Anything computable is computed, never written in prose.** Test counts, checksums, the CI matrix,
which apps have tests, what is deployed — every one of these has gone stale here *because it was
prose*. `/admin` reads them live and never guesses. A number you type today is wrong next week and
nothing tells you.

**A request is a Linear issue with an owner.** That is how you ask another agent for something. Not a
note in your handoff that nobody else reads — say it to the technical director, who owns the queue.
**Its body ends with a Next steps section** — numbered, each step naming who acts, kept current by
whoever changes the issue. The next session acts on it without reading the history; an issue that
needs the history to act on is a note, not a request.

### When a document reaches its cap

Caps are in the table above and enforced by `scripts/drift-check.mjs`, which **warns ten lines out
and fails past the ceiling**. The warning is a prompt to compact, not a wall to route around. Take
the file entry by entry:

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

**What is deliberately not a channel.** Worklogs were retired on 2026-09-16. They existed so a live
agent could see what another live agent had claimed *right now*, which cannot happen, and every real
message in one had a better home. `read-all.sh` went with them.

---

## Who you are

| Agent | Owns | Charter |
|---|---|---|
| Technical Director | gatekeeping, the Linear queue, merges, **DevOps — Vercel, DNS, CI, deploys**, **app surface**, **Postgres**, **`apps/editor`** (frozen) | `.claude/agents/td/` |
| TechPad Gen | `apps/home`, `apps/tracker`, **the visual theme of every app**, shared components | `.claude/agents/techpad-gen/` |
| Resume Formatter | `apps/resume` | `.claude/agents/resume/` |
| Coffee | `apps/coffee` | `.claude/agents/coffee/` |
| Health | `apps/health` | `.claude/agents/health/` |
| Cookbook | `apps/cookbook` | `.claude/agents/cookbook/` |

Each folder holds `RULES.md` and `HANDOFF.md`. The prompts that start a session are in
`.claude/agents/KICKOFF.md`.

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

- **Joel: create or delete a Vercel project, add or remove a domain, or change a DNS record.** No
  undo, and no test catches them. Changing settings on a project that already exists is fine — the
  line is between configuring something that exists and creating, destroying or re-pointing it.
- **Joel: edit this file.** It is approved before it changes. **If what you are about to build
  contradicts it, stop and ask before you build it.** Raising it in the pull request is the backstop
  for something discovered late, not the normal path — code already written applies pressure to
  approve it, which is what this rule exists to prevent.
- **A charter is not the agent's to edit — settled 2026-09-20.** `agents/<you>/RULES.md` is a rule,
  and rules are decided and followed rather than owned: **the technical director drafts, Joel
  approves, you follow.** It was already the shape in practice, since Joel approved every charter
  change anyway, and it makes a cross-agent edit one pull request instead of six.
  **Your `HANDOFF.md` stays yours and always will.** That is state, not a rule, and a handoff written
  by anyone but the agent who did the work is the second-hand account these files exist to replace.
  **Propose a charter change** — in your handoff, a pull request body, or a Linear issue. Do not make it.
- **The technical director: the shared auth plumbing** — `lib/auth.ts`, `lib/password.ts`,
  `middleware.ts`, or anything touching `SESSION_SECRET` and the shared cookie. **These are gated for two different reasons, and
  merging them is how the rule gets talked past.** `lib/auth.ts` and `lib/password.ts` genuinely are
  byte-identical in every app — checksummed, not assumed — and a mismatch does not throw, it
  silently rejects valid sessions on the other four. `middleware.ts` is **three distinct versions**:
  `home`, `resume` and `coffee` share one, `editor` adds a scoped `/api/draft` bypass, `tracker`
  adds `/api/summary` and waves `/api/cron/*` through. That divergence is deliberate, so "they are
  all the same" is not the reason to leave it alone — and an agent who checks, finds three, and
  concludes the rule is wrong has been handed that conclusion by the rule itself. **It is gated
  because it *is* the password gate.** A bad edit does not break a login; it publishes an endpoint.

### Always

- **One branch per change, named `claude/<area>-<description>`.** Area is the app folder where there
  is one — `home`, `editor`, `tracker`, `resume`, `coffee`, `health` — otherwise the layer it
  touches: `ci`, `db`, `brief`, `platform`. What has to be readable at a glance is **which area and
  what change**.
  A session's opening branch is named by the harness (`claude/kickoff-…`) and names neither; that is
  expected and it is not the branch the work belongs on.
- **Commit and push your work. Do not open a pull request until Joel asks for one.** This binds every
  agent, the technical director included. Work on your branch, commit as you go, push it, and when it
  is finished say so and stop. **A finished branch is the deliverable.** CI runs on every branch
  push, so nothing is unverified while it waits — and nothing is live either.
  **When he asks, open it normally — not as a draft — and record the request in the body:**

  ```
  Requested by Joel on YYYY-MM-DD — "what he said"
  ```

  **No other agent can see the conversation where he asked**, so the request lands in the repo or it
  did not happen. `requested-by-joel` fails a body without that line. What no check can see is
  whether the quote is real, so **this rule rests further on honesty than the ones around it.**
- **Three phrases from Joel mean three specific things.** They exist so he can move work without
  spelling out the steps each time, and so the steps are the same for every agent.

  **"Close out."** Finish what you are on, commit and push, update your `HANDOFF.md`, and **open the
  pull request** — body carrying `Requested by Joel on YYYY-MM-DD — "close out"`, blast radius, and
  the Deployment section. Then say the branch is pushed and stop. **This is the ask the rule above
  requires**; there is no separate permission to wait for.

  **"Park it."** The same, without the pull request. Stop at the pushed branch. He uses this when he
  wants the work safe but not in the queue.

  **"Pick up: <thing>."** New work. Come back with what you understand the job to be, what you would
  do first, and anything it contradicts. **Do not cut a branch or write code until he answers** —
  until then you do not know what the change is, and the branch would be named after a guess.

- **State your blast radius in the pull request:** which apps, which shared files.
- **Only the technical director watches a pull request.** Subscribing to a pull request's activity —
  CI failures, review comments — is the technical director's, and no other agent offers it. **Only
  one watcher gets the events**, and a second subscriber silently receives nothing rather than an
  error, so two agents watching means one is deaf to the thing it promised to watch.
- **Adding or deprecating an app under `apps/` needs no CI change.** The matrix is derived from the
  folders on disk, and one fixed-name `gate` job sits in front of it, so branch protection requires
  a single check that never changes shape. Create the folder and it builds; delete it and it stops.
  **What still cannot be automated is the Vercel project and the DNS record** — both outside the
  repo, both without an undo. Everything else The Garage will tell you is missing.
- **TechPad Gen owns the theme, in every app.** Palette, tokens, type, spacing, and the shared
  component language. **Surface is not the theme and is the technical director's** — whether a tool
  is a site or an app decides its shell and its navigation, which is architecture, and it is settled
  at standup rather than in a feature. **The rules are in `.claude/SURFACE.md`; read it before you
  design a screen.** Page count is not the test — Coffee and the Resume Formatter have the same
  number of routes and are not the same shape. **Using what exists is free and needs nobody** — build with the tokens already
  there. **What needs TechPad Gen is changing or forking it.** One owner rather than five because the
  hub embeds the tools in iframes, so two apps' buttons sit inches apart on one screen; drift there
  is visible and makes one product look like several.
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
  treated as destructive until someone reads the SQL. **The technical director applies it at gate
  time, before merging** — not Joel, and not the agent.
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
  makes your handoff's description wrong, correcting it is part of the change.
  **The next session in your area starts from this file and nothing else.** A handoff composed from
  a summary rather than from the work is fluent, second-hand and confidently wrong — the single
  failure this project has paid for most. **Short sessions moved that risk rather than removing it**,
  from mid-session to the gap between sessions, which this file is the only thing spanning.
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

Merging is the technical director's, and the gate is specified in `.claude/agents/td/RULES.md`.
What every agent needs to know: **CI green on the current head, handoffs current, the request
recorded, the Deployment section filled in, squash merge, branch deleted.** A stale handoff sends
the change back; it does not get fixed by the TD on the way past.

---

## The shared foundation

Per-tool detail lives in that tool's charter. Live facts about what is deployed are at `/admin`.

- **One repo, monorepo layout.** One folder per tool under `apps/`, each with its own
  `package.json`, each pointed at by its own Vercel project via that project's Root Directory. There
  is no root `package.json`; work inside the relevant app folder. **`packages/shared` holds the one
  real copy of every file that must be identical in every app** — `lib/auth.ts`, `lib/password.ts`,
  `lib/theme.css`, `lib/theme.ts` and `next.config.mjs`. `node scripts/stamp-shared.mjs` writes the
  copies, `--check` verifies them, and **`drift` fails a copy that disagrees**, so a session or
  lockout fix is now **one edit and a command** rather than one edit per app. **Do not edit a copy**
  — each opens with a banner saying so. **They are still copies, and deliberately so**: a root
  workspace install would buy one real `import` and cost the per-app independence that the Vercel
  Root Directories and the derived CI matrix both rest on. **`lib/supabase.ts` stays a per-app
  variant** and the hub has none at all, which is the hub holding no database credential.
- **One Supabase project**, each tool in its own Postgres schema — `shared`, `editor`, `tracker`,
  `resume`, `coffee`, `health`, `cookbook` — never the default `public`. One migration history, at `supabase/`
  in the repo root, never under an app. **Read `supabase/README.md` before writing one.** A new schema inherits
  no grants at all, so adding one means two migrations and a dashboard setting — three steps.
- **Row Level Security on every table, deny-by-default, zero policies.** The server uses the service
  role key, which bypasses RLS. RLS exists purely as the fallback if a key ever leaks — and because
  `ALTER DEFAULT PRIVILEGES` grants `anon` table access automatically, it is the only control between
  a leaked publishable key and the data.
- **One deliberately shared table: `shared.contacts`** — written and read by the Message Editor and
  the Pipeline Tracker app, so a person exists once rather than as drifting duplicates. **The editor
  is the technical director's and the tracker is TechPad Gen's as of 2026-09-19**, so the write rules
  are a cross-app contract rather than one agent's internal note.
- **No secrets reach the browser.** Every Supabase read/write and every Anthropic call happens
  through the app's own server-side API routes.
- **One login covers every subdomain.** The session cookie is scoped to `.techpaddock.io`;
  `SESSION_SECRET` must be byte-identical across every Vercel project or the others silently
  reject valid sessions. The tools send
  `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` so only the hub embeds them.
- **Every deployed app sits behind a password**, with lockout after repeated failed attempts.
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
| `editor.techpaddock.io` | Message Editor — **paused** | `tp-message-editor` |
| `tracker.techpaddock.io` | Pipeline Tracker | `tp-tracker` |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` |
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` |
| `health.techpaddock.io` | Health | `tp-health` |
| `cookbook.techpaddock.io` | Cookbook | `tp-cookbook` |

**The Message Editor is paused and its red check is expected — ignore it.** `tp-message-editor`
deploys `BLOCKED` on every commit, so `Vercel – tp-message-editor` is red **on `main` itself** and
every pull request here reads `mergeable_state: unstable`. **Not a gate failure, not a reason to
hold a merge.** The general rule: **check a red status against `main` before treating it as yours** —
red on both is the repo's weather, not your change.

---

## What is actually enforced

Most rules here are convention: they hold because an agent chooses to comply. Three things do not.

1. **`main` is protected**, confirmed against the GitHub API rather than assumed.
2. **The `.claude/settings.json` hooks** run whether or not anyone wants them to — they refuse a push
   to `main`, refuse rewriting the migration history, hold opening, updating and merging a pull request
   for Joel's click, and point every session at Linear.
3. **`requested-by-joel`** fails a pull request whose body does not record who asked for it, and
   **`drift`** fails one where a rule in this file has stopped being true — the checksums, the three
   `middleware.ts` variants, the CI matrix, the file budgets. It measures rather than trusting the
   document. `node scripts/drift-check.mjs` runs it locally; `--json` is what The Garage renders.

**"Do not open a pull request until Joel asks" became enforced on 2026-09-23** (#186): the hook in
item 2 holds every pull request an agent opens for his click. What still rests on honesty is the
quote — `requested-by-joel` can see that the line is there, never that he said it.

Every rule in this file was written after something went wrong: three branches editing it at once,
six schema migrations that lived only in the database, a Vercel project serving an unprotected page
to the public, real contact names committed to the file that forbids committing names, and sixteen
merge commits from a single reused branch. The gate existed and was walked straight through.
