# Paddock — how to work here

techpaddock.io is a personal command center: one shared foundation supporting five standalone
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

The open-items ledger is printed into your session by a hook, so it is already there too.

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
| `agents/<you>/RULES.md` | your job, your domain, the reasoning behind your design | every session | overwrite, Joel approves |
| `agents/<you>/HANDOFF.md` | **your area's state right now** | every session | **overwrite · ≤80 lines** |
| `.claude/OPEN-ITEMS.md` | **open requests, each with an owner** | every session, via hook | **overwrite · ≤80 lines** |
| `.claude/DECISIONS.md` | settled calls, mistakes, traps | before reopening something | **append · ≤200 lines** |
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

**A request is a ledger row with an owner.** That is how you ask another agent for something. Not a
note in your handoff that nobody else reads — say it to the technical director, who owns the ledger.

**What is deliberately not a channel.** Worklogs were retired on 2026-09-16. They existed so a live
agent could see what another live agent had claimed *right now*, which cannot happen, and every real
message in one had a better home. `read-all.sh` went with them.

---

## Who you are

| Agent | Owns | Charter |
|---|---|---|
| Technical Director | ops, gatekeeping, the ledger, merges | `.claude/agents/td/` |
| TechPad Gen | `apps/home`, **the visual theme of every app**, cross-cutting UI | `.claude/agents/techpad-gen/` |
| Message Editor | `apps/editor` | `.claude/agents/message-editor/` |
| Pipeline Tracker | `apps/tracker` | `.claude/agents/tracker/` |
| Resume Formatter | `apps/resume` | `.claude/agents/resume/` |
| Coffee | `apps/coffee` | `.claude/agents/coffee/` |
| Platform Config | Postgres, Vercel, DNS, CI | `.claude/agents/platform/` |

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
  and the author fields in `docProps/`, not just `document.xml`.
- **Make a check pass by weakening it.** No skipping or disabling a test, no loosening an assertion,
  no repairing the migration history, no empty commit to re-trigger CI. When something is red, either
  the code is wrong or the check is wrong. Say which one, and fix that.
- **Apply a schema change without its migration file in the same pull request.** The database is not
  allowed to be the only record of its own shape again.

### Never without asking first — and who to ask

- **Joel: create or delete a Vercel project, add or remove a domain, or change a DNS record.** No
  undo, and no test catches them. Changing settings on a project that already exists is fine — the
  line is between configuring something that exists and creating, destroying or re-pointing it.
- **Joel: edit this file, or any charter but your own.** Both are approved before they change. **If
  what you are about to build contradicts either, stop and ask before you build it.** Raising it in
  the pull request is the backstop for something discovered late, not the normal path — code already
  written applies pressure to approve it, which is what this rule exists to prevent.
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
  is one — `home`, `editor`, `tracker`, `resume`, `coffee` — otherwise the layer it touches: `ci`,
  `db`, `brief`, `platform`. What has to be readable at a glance is **which area and what change**.
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
- **State your blast radius in the pull request:** which apps, which shared files.
- **Adding or deprecating an app under `apps/` needs no CI change.** The matrix is derived from the
  folders on disk, and one fixed-name `gate` job sits in front of it, so branch protection requires
  a single check that never changes shape. Create the folder and it builds; delete it and it stops.
  **What still cannot be automated is the Vercel project and the DNS record** — both outside the
  repo, both without an undo. Everything else The Garage will tell you is missing.
- **TechPad Gen owns the theme, in every app.** Palette, tokens, type, spacing, and the shared
  component language. **Using what exists is free and needs nobody** — build with the tokens already
  there. **What needs TechPad Gen is changing or forking it.** One owner rather than five because the
  hub embeds the tools in iframes, so two apps' buttons sit inches apart on one screen; drift there
  is visible and makes one product look like five.
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
  or in the pull request when Joel asks for one. A finished branch is a checkpoint: the session may
  be compacted right after it, and that is the normal case here rather than the unlucky one.
  **Say what is now true, not what you did** — the commit already records the what. If the change
  makes your handoff's description wrong, correcting it is part of the change.
  **Then say, in as many words, that you are at a compaction point.** That sentence is the only
  signal anyone gets that the work is on disk rather than still in your head. A handoff written after
  a compaction is composed from a summary of a summary: fluent, second-hand, and confidently wrong,
  which is the single failure this project has paid for most.
- **End every message to Joel with the three-part sign-off.** Every message, so he never has to go
  looking and never has to ask what state anything is in. Three headings, always in this order,
  always all three — a section with nothing in it says so rather than being dropped, because a
  missing section and a quiet one are indistinguishable.

  **1 · Work Brief.** One or two lines on what you just finished, in this message. Not the session,
  not the plan — what is now done. **`None.` is the correct answer when you only answered a
  question**, and it is written.

  **2 · DevOps.** One line per branch of yours that is not on `main` yet, with a light. Report only
  what you measured in this session, from `git status` and a live check run — **never from memory,
  and never a colour you did not look up.** If you could not check, say `unchecked` rather than
  guessing a colour.

  | Light | Means |
  |---|---|
  | 🟢 Green | Pushed, CI green, finished. Nothing left but his word. |
  | 🟡 Yellow | Exists but is not ready — uncommitted in the working tree, pushed with CI still running, or waiting on an answer. |
  | 🔴 Red | CI failing, a merge conflict, or a step that errored. **Say what is broken, not just that it is.** |

  **The technical director lists every open branch and pull request here**, because the merge queue
  is the job. **Every other agent lists only its own** — you cannot see whether another agent's
  branch moved, and a green light you inferred is worse than no line at all.

  **3 · Open Items.** The ledger. **The technical director prints every row; every other agent
  prints only the rows whose `Agent` is them.** A merge waiting on Joel is hoisted onto its own line
  above the table, named by branch and whether it is green — it is the one thing that is purely his
  yes or no, and the line is always written, including `**Waiting on your word:** nothing.` Then the
  table, one line per item, no prose underneath:

  ```
  | Item | Owner | Urgency | Blocking | Agent |
  ```

  **`Owner` is who takes the next action; `Agent` is whose area it is.** The rows where they differ
  are the ones worth seeing. **Urgency is one of three words** — `Now` (Joel is the blocker), `Soon`
  (real work, not blocked on him), `Whenever` (parked, or nothing turns on it). **`Blocking` names
  what the item holds up, or the word `nothing`** — that is how an item earns being ignored tonight.
  **Never fill in a row you cannot see.** What you genuinely know is the ledger, your own handoff,
  and the conversation in front of you. Do not report on another agent's behalf or infer that their
  work has moved. A guess in a status footer is worse than a missing row, because a table reads as
  verified whether or not anybody verified it. **"Nothing open" is a valid answer and must be
  written.**

### Ask the second-order questions first

Before a change is agreed — not after it is built. Answer these out loud in whatever you send back:

1. **What does this contradict?** The brief, another charter, or a decision already settled.
2. **Who else depends on it?** Shared files, cross-app contracts, schema, environment variables.
3. **What becomes true afterwards that is not true now?**
4. **What does this make harder to change later?** A schema shape, an API contract, a name.
5. **Who decides this — the technical director or Joel?** If you cannot tell, it is Joel.

The first-order questions ask whether the work is good. These ask what the work makes true. One
change once passed every first-order check and quietly contradicted three settled decisions.

**Any answer that lands on "this contradicts something settled" stops the work and goes to Joel**,
at the point where changing course is still free.

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

- **One repo, monorepo layout.** `apps/{home,editor,tracker,resume,coffee}`, each with its own
  `package.json`, each pointed at by its own Vercel project via that project's Root Directory. There
  is no root `package.json`; work inside the relevant app folder. `packages/shared` was never
  created: `lib/auth.ts` and `lib/password.ts` are byte-identical copies in every app and
  `lib/supabase.ts` is a per-app variant. **`lib/theme.css` is a sixth byte-identical five-way
  copy** — unlike the auth pair its drift is loud, showing up as one app looking wrong beside
  another in an iframe, but it is one more file that must be edited five times. A session or lockout
  fix is the same edit five times. Worth consolidating before the auth logic changes again.
- **One Supabase project**, each tool in its own Postgres schema — `shared`, `editor`, `tracker`,
  `resume`, `coffee` — never the default `public`. One migration history, at `supabase/` in the repo
  root, never under an app. **Read `supabase/README.md` before writing one.** A new schema inherits
  no grants at all, so adding one means two migrations and a dashboard setting — three steps.
- **Row Level Security on every table, deny-by-default, zero policies.** The server uses the service
  role key, which bypasses RLS. RLS exists purely as the fallback if a key ever leaks — and because
  `ALTER DEFAULT PRIVILEGES` grants `anon` table access automatically, it is the only control between
  a leaked publishable key and the data.
- **One deliberately shared table: `shared.contacts`** — written and read by the Message Editor and
  the Pipeline Tracker, so a person exists once rather than as drifting duplicates.
- **No secrets reach the browser.** Every Supabase read/write and every Anthropic call happens
  through the app's own server-side API routes.
- **One login covers every subdomain.** The session cookie is scoped to `.techpaddock.io`;
  `SESSION_SECRET` must be byte-identical across all five Vercel projects or the others silently
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
| `editor.techpaddock.io` | Message Editor | `tp-message-editor` |
| `tracker.techpaddock.io` | Pipeline Tracker | `tp-tracker` |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` |
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` |

---

## What is actually enforced

Most rules here are convention: they hold because an agent chooses to comply. Three things do not.

1. **`main` is protected**, confirmed against the GitHub API rather than assumed.
2. **The `.claude/settings.json` hooks** run whether or not anyone wants them to — they refuse a push
   to `main` and refuse rewriting the migration history, and they print the ledger into every session.
3. **`requested-by-joel`** fails a pull request whose body does not record who asked for it, and
   **`drift`** fails one where a rule in this file has stopped being true — the checksums, the three
   `middleware.ts` variants, the CI matrix, the file budgets. It measures rather than trusting the
   document. `node scripts/drift-check.mjs` runs it locally; `--json` is what The Garage renders.

Notably **"do not open a pull request until Joel asks" is not one of them**, because every agent acts
as the same GitHub account and nothing mechanical can tell an asked-for pull request from an
unasked-for one. That rule holds on honesty, and it is the most important convention here for
exactly that reason.

Every rule in this file was written after something went wrong: three branches editing it at once,
six schema migrations that lived only in the database, a Vercel project serving an unprotected page
to the public, real contact names committed to the file that forbids committing names, and sixteen
merge commits from a single reused branch. The gate existed and was walked straight through.
