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
- **Three phrases from Joel mean three specific things.** They exist so he can move work without
  spelling out the steps each time, and so the steps are the same for every agent.

  **"Close out."** Finish what you are on, commit and push, update your `HANDOFF.md`, and **open the
  pull request** — body carrying `Requested by Joel on YYYY-MM-DD — "close out"`, blast radius, and
  the Deployment section. Then say you are at a compaction point and stop. **This is the ask the
  rule above requires**; there is no separate permission to wait for.

  **"Park it."** The same, without the pull request. Stop at the pushed branch. He uses this when he
  wants the work safe but not in the queue.

  **"Pick up: <thing>."** New work. Come back with what you understand the job to be, what you would
  do first, and the second-order answers. **Do not cut a branch or write code until he answers** —
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
- **Open every message to Joel with a horizontal rule.** A markdown `---` on its own line, as the
  very first line, before any prose. It is the one mark that separates your reply to him from the
  tool output, file dumps and command results scrolling past above it — he reads this terminal all
  day and should never have to hunt for where your answer starts. It costs one line and it is not
  optional, including on a one-sentence answer.
- **End every message to Joel with the three-part sign-off.** Every message, so he never has to go
  looking and never has to ask what state anything is in. Three headings, always in this order,
  always all three — a section with nothing in it says so rather than being dropped, because a
  missing section and a quiet one are indistinguishable.

  **1 · Work Brief.** What you finished in this message, as **dashed bullets, one per thing** — the
  dashes are the point, because a paragraph of three accomplishments reads as one. Not the session,
  not the plan; what is now done. **`- None.` is the correct answer when the message only answered a
  question**, and it is written rather than dropped.

  **2 · DevOps.** What exists and is not live yet, one line each, carrying **what it is, whose it
  is, and the stage it is parked at** — the owning agent is a column so he can see at a glance who a
  branch belongs to, because a branch name does not always say. Five stages, in the order work moves
  through them, and the words are the ones Joel reads — not git's:

  ```
  | | Branch or PR | Agent | Stage |
  ```

  | | Stage | Means |
  |---|---|---|
  | 🟡 | **In progress** | Still being worked on. Covers everything before it is finished, saved or not — that distinction is the agent's business, never his. |
  | 🟡 | **Needs a PR** | Finished and pushed, CI green — but the pull request is still work, so it is yellow until Joel asks and the agent writes it. |
  | 🟢 | **Ready to merge** | Pull request open, CI green on its head. **The agent's work is finished here** — the only thing left is the technical director's merge. |
  | 🔴 | **Stuck** | CI failing, a merge conflict, or a step that errored. **Say what is broken, not just that it is.** |
  | 🟣 | **Needs deletion** | Merged, superseded or dead, and the remote branch is still there. |

  **Every agent reports its own work, all the way through** — from in progress to merged. **The
  technical director reports every pushed branch and every open pull request**, because the merge
  queue is the job.

  **It cannot report another agent's in-progress work.** That lives in the other agent's session and
  never reaches the repo until it is pushed, so a line about it would be invented. This is the same
  rule as the ledger's: what you have not measured does not get a row.

  **Needs deletion is nearly always Joel's action, which is why it gets its own colour.** No agent
  can delete a remote branch here — the proxy refuses it — so a dead branch stays listed until he
  removes it, and a line that never changes colour is one everybody stops reading. It covers three
  cases: a merge that did not delete its branch, a duplicate of work that is already somewhere else,
  and **a branch that is a liability rather than clutter** — one carrying something scrubbed from
  `main`, which stays reachable through that ref for as long as the ref exists. **Say which of the
  three it is**, because only the last one is urgent.

  **Colour tracks whether an agent still has work, not who is blocking.** That is why *Needs a PR*
  is yellow: the branch is finished, but writing the pull request — body, blast radius, Deployment
  section — is real work that has not happened yet. **Green means nothing is left but the merge.**
  Reading the colours alone should answer "is anything of mine still to do", and the stage name
  beside it says who moves next.

  **Ready to merge is an agent's finish line, and it is reported as one.** Committed, pushed, pull
  request open, checks green: from that agent's side and from Joel's, **the task is complete**. So
  the row is green, the Work Brief says the thing is finished, and it is not carried as though
  something were still owed. **The merge is never the agent's**, and waiting on someone else is not
  the same as having work left. An agent that reports its own finished work as though it were still
  outstanding teaches Joel to read green as "not yet", which costs the colour its meaning in every
  other row.
  **What does come back to that agent is a red check or a review comment on its own pull request.**
  That is the row turning 🔴 *Stuck* and becoming work again — not green having meant less than it
  said.

  **A stage comes from `git status` and a live check run in this session — never from memory.** If
  you could not check, the line reads `unchecked` rather than guessing.

  **When Joel asks for status, all three are re-measured — never reprinted.** A status check is a
  request to go and look, and the last sign-off is the one thing that cannot answer it.

  - **Work Brief** becomes what has landed since his last message, not what was in the previous
    footer. `- None.` when nothing has.
  - **DevOps** comes from a live branch list, a live pull request list and check runs read *now*. A
    colour measured earlier in the same session is memory by the time it is reprinted.
  - **Open Items** is **re-read from `.claude/OPEN-ITEMS.md` on disk.** The `SessionStart` hook
    prints it once, at the start; after that every table you write from context is a memory of a
    file that merges have been changing underneath you. **This is the one that actually goes wrong**
    — a long session's footer quietly drifts from the ledger it claims to be reporting, and because
    a table reads as verified, nothing says so.

  **3 · Open Items.** The ledger. **The technical director prints every row; every other agent
  prints only the rows whose `Agent` is them.** A merge waiting on Joel is hoisted onto its own line
  above the table, named by branch and whether it is green — it is the one thing that is purely his
  yes or no, and the line is always written, including `**Waiting on your word:** nothing.` Then the
  table, one line per item, no prose underneath:

  ```
  | # | Item | Owner | Urgency | LoE | Blocking | Agent |
  ```

  **`#` is the item's number, and it is read from the ledger — never invented at print time.**
  It exists so Joel can answer with a number instead of restating the item: "do 3" is a complete
  instruction. **The numbers run continuously through `.claude/OPEN-ITEMS.md`, across every section
  and every agent**, so one number names one item everywhere it is printed. **An agent printing only
  its own rows keeps the ledger's numbers and does not renumber them from one** — renumbering a
  subset is how "item 3" comes to mean two different things in two different sessions, which is the
  whole failure the column exists to prevent. A number is stable until the item closes; when it
  does, the ledger is renumbered on the next write and the sign-off follows the file.
  **The DevOps table is deliberately not numbered** — its rows are named by branch, which is already
  a stable handle and a more useful one, and a second numbering scheme in the same message would
  make "item 3" ambiguous again.

  **`Owner` is who takes the next action; `Agent` is whose area it is.** The rows where they differ
  are the ones worth seeing. **Urgency is one of three words** — `Now` (Joel is the blocker), `Soon`
  (real work, not blocked on him), `Whenever` (parked, or nothing turns on it). **`LoE` is one of
  three too** — `Minutes` (a setting, a paste, a yes or no), `A session` (real work, one sitting),
  `Multi-session` (spans sittings and needs its own plan). **`Blocking` names what the item holds
  up, or the word `nothing`** — that is how an item earns being ignored tonight.

  **Urgency and LoE both describe the owner's next action, not the whole item.** A decision Joel
  makes in thirty seconds reads `Minutes` even when the work it releases is weeks — that is the
  point of the column, because the two questions "what does this cost me tonight" and "what does
  this cost the project" have different answers and only the first one sorts a list. Where the
  follow-on is much larger than the next action, the row's own text says so.
  **LoE is written in the ledger, not estimated at print time.** A number invented per session
  drifts between sessions, which is the failure this file exists to stop.
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
