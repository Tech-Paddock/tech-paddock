# Paddock — how to work here

techpaddock.io is a personal command center: one shared foundation supporting five standalone
tools, each independently deployed. This file is the highest level. It tells you how to operate
and where your own instructions live. **It does not contain them.**

This is a single-user project. Simplicity beats the multi-team defaults that show up in most infra
advice.

---

## Read this before you touch anything

In this order, every session, before any project work:

1. **This file.** It is loaded into your context automatically. The universal rules below bind you
   no matter which agent you are.
2. **Your charter** — `.claude/agents/<you>/RULES.md`. Your job, your domain, your guardrails.
   Nothing loads this for you. Open it yourself. It is not optional and it is not background
   reading; it is the specification for your work.
3. **Your handoff** — `.claude/agents/<you>/HANDOFF.md`. What state your area is in, what is in
   flight, what to do next.
4. **Everyone else's worklogs** — `bash .claude/worklogs/read-all.sh`. This prints the technical
   director's open-items ledger and every agent's worklog from every branch. If someone has
   already claimed a file you were about to touch, say so in your worklog and in your pull request
   before you touch it.
5. **Once the change is agreed, claim it** — create a fresh branch named for that change, never
   reusing one, then open `.claude/worklogs/<your-branch>.md` and write your claim entry. Close it
   before you finish. Format is in `.claude/worklogs/README.md`.

   The branch comes *after* the agreement, not before. Until Joel has answered you do not yet know
   what the change is, so a branch cut earlier is named for a guess — and a branch named for a
   guess is how one gets reused for unrelated work, which is what put sixteen merge commits on
   `main`.

Agents here never run at the same time and cannot see each other. There is no way to ask another
agent anything. The repo is the only channel, and these five steps are the whole protocol.

---

## Who you are

| Agent | Owns | Charter |
|---|---|---|
| Technical Director | ops, gatekeeping, the ledger, merges | `.claude/agents/td/` |
| TechPad Gen | `apps/home`, cross-cutting UI, shared conventions | `.claude/agents/techpad-gen/` |
| Message Editor | `apps/editor` | `.claude/agents/message-editor/` |
| Pipeline Tracker | `apps/tracker` | `.claude/agents/tracker/` |
| Resume Formatter | `apps/resume` | `.claude/agents/resume/` |
| Coffee | `apps/coffee` | `.claude/agents/coffee/` |
| Platform Config | Postgres, Vercel, DNS, CI — the layer under every app | `.claude/agents/platform/` |

Each folder holds `RULES.md` (your job and guardrails), `HANDOFF.md` (current state) and
`KICKOFF.md` (the prompt that starts you). `.claude/agents/README.md` is the map.

If you do not know which agent you are, stop and ask. Do not guess and do not adopt a charter that
was not given to you.

---

## Universal rules

These bind every agent. Your charter adds to them; it never overrides them. They live here once,
in the file every session loads, so that they cannot drift the way seven copies would.

### Never, without the technical director

- **Push to `main`.** Every change goes through a pull request, including small ones.
- **Create or delete a Vercel project, add or remove a domain, or change a DNS record.** These have
  no undo and no test catches them. A wrong DNS record takes every subdomain down and you find out
  from a browser. Changing settings on a project that already exists is fine — see below.
- **Apply a schema change without its migration file in the same pull request.** The database is
  not allowed to be the only record of its own shape again.
- **Edit the shared auth plumbing** — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, or
  anything touching `SESSION_SECRET` and the shared cookie. **These are gated for two different
  reasons, and merging them is how the rule gets talked past.**
  `lib/auth.ts` and `lib/password.ts` genuinely are byte-identical in all five apps — checksummed,
  not assumed — and a mismatch does not throw. It silently rejects valid sessions on the other four.
  `middleware.ts` is **three distinct versions**: `home`, `resume` and `coffee` share one, `editor`
  adds a scoped `/api/draft` bypass, `tracker` adds `/api/summary` and waves `/api/cron/*` through.
  That divergence is deliberate, so "they are all the same" is not the reason to leave it alone —
  and an agent who checks, finds three, and concludes the rule is wrong has been handed that
  conclusion by the rule itself. **It is gated because it *is* the password gate.** A bad edit here
  does not break a login; it publishes an endpoint. `tracker` already shows the shape: `/api/cron/*`
  skips the gate entirely and the route's own `if (secret && …)` check fails **open** when
  `CRON_SECRET` is unset — harmless today only because Graph is unconfigured.
- **Edit this file, or any charter but your own.** Both are approved before they are updated, never
  quietly alongside the code that outdated them. **If what you are about to build contradicts
  either, stop and ask before you build it** — in your worklog and to Joel. Raising it in the pull
  request is the backstop for a contradiction you only discover late, not the normal path. Code
  that is already written applies pressure to approve it, which is exactly what this rule exists
  to prevent.
- **Commit personal information or secrets.** Names, employers, schools, addresses, contact
  details, resume content. For a `.docx` that means every part of the archive, not just
  `document.xml` — hyperlink targets in `.rels` and the author fields in `docProps/` too.
- **Make a check pass by weakening it.** No skipping or disabling a test, no loosening an
  assertion, no `supabase migration repair`, no empty commit to re-trigger CI. When something is
  red, either the code is wrong or the check is wrong. Say which one, and fix that.

Allowed without asking: changing build settings on a Vercel project that already exists — Node
version, environment variables, ignored build step. Those are reversible and visible. The line is
between configuring something that exists and creating, destroying, or re-pointing it.

### Always

- **One branch per change, named `claude/<action>-<area>-<description>`.**

  **Action** is what kind of change it is. Six, and they do not overlap:

  | | |
  |---|---|
  | `feat` | a new capability |
  | `fix` | something is broken |
  | `ci` | the pipeline — workflows, checks, branch protection |
  | `db` | schema and migrations |
  | `doc` | the brief, charters, handoffs, worklogs |
  | `ops` | Vercel, DNS, environment variables, secrets |

  **Area** is the app folder that owns it — `home`, `editor`, `tracker`, `resume`, `coffee` — and is
  **left out when no single app owns the change.** A repo-wide pipeline change is
  `claude/ci-per-app-builds`, not `claude/ci-all-per-app-builds`; an invented area is worse than a
  missing one.

  **Description** is a few hyphenated words naming the change. Anything after that is noise and
  nobody minds it. What has to be readable at a glance is **kind, area, change** — that is the whole
  question being asked of a branch list.

  `claude/feat-coffee-brew-log` · `claude/fix-resume-highlights-table` ·
  `claude/db-resume-template-archive` · `claude/ci-per-app-builds` ·
  `claude/doc-brief-migration-conventions`

  **The action says what the change *is*, never where it has got to.** `pr`, `mrg`, `ready`,
  `blocked` and the like do not go in a branch name, and the reason is not style: a name is fixed for
  the life of the branch and a status moves several times a day, so a branch called `mrg-…` is
  telling the truth for about an hour and lying afterwards — and nobody renames a branch to keep a
  label honest. Where a change has got to is already carried by things that update themselves: the
  pull request's own state, and the technical director's ledger, which exists precisely to answer
  "what needs me".

  A session's opening branch is named by the harness and arrives as something like
  `claude/kickoff-pxdz0f`, which names none of the three. That is expected and it is not the branch
  the work belongs on: the brief already requires cutting a fresh branch once the change is agreed,
  and that is the one that gets the name.
  A session's opening branch is named by the harness and arrives as something like
  `claude/kickoff-pxdz0f`, which names neither. That is expected and it is not the branch the work
  belongs on: the brief already requires cutting a fresh branch once the change is agreed, and that
  is the one that gets the name.
  Never reuse a branch across unrelated work, and never treat one as a permanent working branch.
- State your blast radius in the pull request: which apps, which shared files.
- Add any new app under `apps/` to the CI matrix in `.github/workflows/ci.yml` in the same pull
  request. The matrix is hardcoded to five names and silently skips anything else, so a new app
  ships untested and nothing tells you.
- Keep your worklog current. It carries what a commit cannot: what you are doing right now, what
  you are blocked on, what you decided that affects someone else, what you need from the TD.
- **Commit and push your work. Do not open a pull request until Joel asks for one.** This binds
  every agent, the technical director included. Work on your branch, commit as you go, push it, and
  when it is finished say so — in your worklog and to Joel — then stop. **A finished branch is the
  deliverable.** Opening a pull request is Joel's decision, and asking for one is how he makes it.
  CI runs on every branch push, so a pushed branch is fully built and tested before he is ever asked.
  Nothing is unverified while it waits, and nothing is live either: a branch affects no deployed app.
  **When he asks, open it normally — not as a draft — and record the request in the body.** One line:

  ```
  Requested by Joel on YYYY-MM-DD — "what he said"
  ```

  The note is not for Joel's benefit and it is not ceremony. **No other agent can see the
  conversation where he asked**, so a pull request is otherwise indistinguishable from one an agent
  opened on its own initiative. The repo is the only channel between agents, which means the request
  lands in the repo or it did not happen.
  **What is enforced, and what is not.** `requested-by-joel` fails any pull request whose body
  carries no such line, and that runs server-side whether or not anyone means to comply. What no
  check can see is whether the quote is real — every agent acts as the same GitHub account, so
  authorship proves nothing, and nothing mechanical can tell an unasked-for pull request from an
  asked-for one. **So this rule rests further on honesty than the ones around it**, which is the
  price of it being this simple. Do not open one on your own judgement, however obviously ready the
  work looks.
- **A migration must be safe to apply *before* the code that needs it.** This is the shape rule,
  and it exists because merging is unattended: a merge triggers the deploy by itself and the new
  code is live in about a minute. Anything a human does *after* the merge happens inside a window
  where the app is already broken, so "apply it at merge" is not an instruction anyone can follow.
  **So the migration goes first and the code follows** — which only works if the migration is one
  the currently-running code can ignore.
  **Additive changes ride with their code.** Add a column, a table, an index, a constraint every
  existing row already satisfies. The old code does not know the new column exists and does not care
  that it does. The database sitting ahead of the code is harmless; the code sitting ahead of the
  database is an outage.
  **Destructive changes split into two pull requests.** The first stops using the column and ships.
  Once that is deployed and live, a second one drops it. The drop is then safe at any moment,
  because by then nothing reads it either way. The cost is honest — two merges and a wait between
  them instead of one — and what it buys is that there is no moment when a deploy and a migration
  race each other.
  `20260912213501` is the case this is written against. It dropped four columns in the same pull
  request as the code that stopped using them: apply it early and the old code breaks, apply it late
  and the new code breaks, and there is no safe moment in between. It went out safely only because
  the technical director queried the live table by hand first and found the columns empty. That is
  luck wearing the clothes of a process.
  **The technical director applies the migration at gate time, before merging.** Not Joel, and not
  the agent. The TD has direct database access and uses it; an agent asserting that applying needs a
  credential nobody holds has guessed, and the guess turns into a manual step that gets forgotten.
  **Say which shape it is in the Deployment section** — additive and applied before merge, or the
  first half of an expand-and-contract with the drop named as the follow-up. A migration whose shape
  is not stated is treated as destructive until someone reads the SQL.
- **Say what it takes to deploy it, every time.** Every pull request carries a **Deployment**
  section, and so does the message in which you hand a finished branch over. Four things: what
  happens by itself when this merges, what a human has to do and in what order, how to verify it is
  genuinely live, and what breaks if the steps are skipped.
  **"Nothing — it deploys itself on merge" is a valid answer and must be written down.** A blank
  section is indistinguishable from a forgotten one.
  This exists because merging and deploying are different events, and every serious incident here
  lives in the gap between them: six migrations that existed only in the database, environment
  variables set in a dashboard that never reached a running deployment because Vercel bakes them in
  at build time, a schema needing a dashboard setting that appears nowhere in this repo, and a
  rotated `SESSION_SECRET` that was silently not live until a redeploy. In each case the code was
  correct and merged, and the change was not real.
  So name the dashboard click, the environment variable, the migration, the required check, the
  redeploy. If it cannot be verified from the repo, say who has to look and where.
- **Update your `HANDOFF.md` when you open a pull request, and again whenever you change what that
  pull request does.** The two files are not the same job. The worklog is what you are doing right
  now and it dies with its branch; the handoff is what the next session in your area inherits and
  it outlives everything. A pull request is the moment work stops being in-flight and becomes
  something the next agent has to know about — so that is when the handoff is written, not at the
  end of a session you may not get to finish.
  Say what is now true, not what you did: the commit already records the what. If the change alters
  a flow, a contract, or a constraint your handoff describes, the old description is now wrong and
  correcting it is part of the change, not follow-up work.

### Merging

- **Handoffs current before the merge.** The technical director reads every handoff the change
  touches and checks it describes what the change leaves behind. A merge that lands a new flow
  while its handoff still describes the old one hands the next session a document that is
  confidently wrong — which is the single failure this project has paid for most often. A stale
  handoff sends the change back; it does not get fixed by the TD on the way past.
- **The request recorded, and the deployment steps stated.** A pull request exists because Joel asked
  for one, so its body says so. If nothing records the request, `requested-by-joel` is already red:
  ask him rather than merging, because the alternative is a pull request nobody asked for going live.
  Check the **Deployment** section is filled in too. Merging is not deploying, and a change that
  merges green and never becomes real is the most repeated failure in this project's history.
- **Decide the order when more than one change is mergeable, before merging any of them.** Order is
  a decision even when nobody makes it, and the one nobody makes is usually wrong. Say what the order
  is and why, in the ledger.
  **Squash merge plus a stack of pull requests is the sharpest case, and it is not obvious.** Merging
  the base of a stack rewrites that change into one new commit, whose identity git cannot match to
  the original the next branch is built on — so the next pull request conflicts in every file the
  first one touched, with no real disagreement in any of them. Before resolving one of those, compare
  the base branch's copy of each conflicted file against what the stacked branch already inherited: if
  they are identical, taking the branch side is lossless as a matter of fact rather than judgement,
  and worth saying so. If they are not, it is a real conflict and belongs to its author.
  Four more ways it bites. **A rule or format change invalidates pull requests already open** — merge it
  after them, or grandfather them explicitly, because landing it first makes finished work fail a
  check for a rule that did not exist when it was written. **Two branches touching one file** — the
  second to merge pays the conflict, so let it fall on the branch still being worked rather than the
  one that is done. **A correction others are waiting on goes first**, so they inherit it instead of
  each rediscovering it. And **a merge that turns another open pull request red** is said out loud
  before, not explained after.
  After each merge the rest are behind. Re-check them; do not merge a second change on a gate result
  taken before the first.
- **Squash merge, always.** One commit on `main` per change.
- **CI green before merge** — all five matrix jobs, on the current head. A red build does not get
  merged on the assumption that the failure is unrelated. Establish that it is, or fix it.
- **Delete the branch after merge.**

### Ask the second-order questions first

Before a change is agreed — not after it is built, and not at the pull request. Answer these out
loud, in your worklog and in whatever you send back before starting:

1. **What does this contradict?** The brief, another charter, or a decision already settled.
2. **Who else depends on it?** Shared files, cross-app contracts, schema, environment variables.
3. **What becomes true afterwards that is not true now?** A new environment variable somebody has
   to set, a new deploy dependency, a new public surface.
4. **What does this make harder to change later?** A schema shape, an API contract, a name.
5. **Who decides this — the technical director or Joel?** If you cannot tell, it is Joel.

This exists because a change can pass every first-order check and still be the wrong thing to
merge. One did: rebased cleanly, worklog opened, brief left untouched, CI green on the head — and
it quietly contradicted three settled decisions, which nobody asked about until after it was on
`main`. The first-order questions ask whether the work is good. These ask what the work makes true.

Any answer that lands on "this contradicts something settled" stops the work and goes to Joel, at
the point where changing course is still free.

### When you think the instruction is wrong

Say so, at a high level, and **stop**. Do not flag a concern and proceed anyway — a warning
attached to work already done is not a warning, it is a receipt.

If the answer is "go anyway", go fully, and do not relitigate the decision three commits later.
Going fully is not going blindly: ask whatever you need in order to execute it correctly.
Relitigating a settled decision is out; asking how to do it properly is expected.

---

## The shared foundation

Every agent needs these. Per-tool detail lives in that tool's charter.

- **One repo, monorepo layout.** `apps/home`, `apps/editor`, `apps/tracker`, `apps/resume`,
  `apps/coffee` — each with its own `package.json`, each pointed at by its own Vercel project via
  that project's Root Directory. There is no root `package.json`; work inside the relevant app
  folder. `packages/shared` was never created: `lib/auth.ts` and `lib/password.ts` are
  byte-identical copies in all five apps and `lib/supabase.ts` is a per-app variant. A session or
  lockout fix is therefore the same edit five times. Worth consolidating before the auth logic
  changes again; not worth churn otherwise.
- **One Supabase project**, each tool in its own Postgres schema — `shared`, `editor`, `tracker`,
  `resume`, `coffee` — never the default `public`. One migration history, at `supabase/` in the
  repo root, never under an app. Read `supabase/README.md` before writing one. **A new schema
  inherits no grants at all**, so adding one means two migrations, not one.
- **Row Level Security on every table, deny-by-default, zero policies.** The server uses the
  service role key, which bypasses RLS. RLS exists purely as the fallback if a key ever leaks —
  and because `ALTER DEFAULT PRIVILEGES` grants `anon` table access automatically, it is the only
  control standing between a leaked publishable key and the data.
- **One deliberately shared table: `shared.contacts`** — id, name, org, position, relationship_type,
  preferred_channel, notes, timestamps. Written and read by the Message Editor and the Pipeline
  Tracker, so a person exists once rather than as drifting duplicates.
- **No secrets reach the browser.** Every Supabase read/write and every Anthropic call happens
  through the app's own server-side API routes. The client only ever talks to its own app.
- **One login covers every subdomain.** The session cookie is scoped to `.techpaddock.io`;
  `SESSION_SECRET` must be byte-identical across all five Vercel projects or the others silently
  reject valid sessions. Every app throws on startup if it is unset. The four tools send
  `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` so only the hub embeds
  them.
- **Every deployed app sits behind a password**, with lockout after repeated failed attempts.
- **Prefer append over rewrite for anything that accumulates.** When a feature involves growing
  history, the default write path is a plain insert — cheap, instant, no model call — with any
  model-driven synthesis kept as a separate, deliberately triggered, batched step.
- **Model choice is per task.** No model is mandated repo-wide. Pick what the job needs —
  capability where judgment matters, something cheaper and faster where it does not — and record
  the choice and the reason at the call site, because the next reader cannot infer either. Apps are
  not required to agree with each other, so "which model are we on" now has one answer per app.
  **Two things the old `claude-sonnet-5` pin was protecting still hold.** Every call stays
  server-side. And a new model can carry API-shape changes — `effort` moving under `output_config`
  caught this project once already — so moving an app to a different model is a deliberate change
  with a test behind it, never a string swap.
- **Chrome is the default browser, on desktop and on the phone. Safari is a utility, used only where
  Chrome cannot do the job.** Every report here comes from Chrome unless it explicitly says
  otherwise, so **Safari is never the explanation for a bug.** A theory resting on WebKit
  third-party cookie partitioning or ITP is a theory about a browser that was not in the loop — the
  mobile login bug already cost one round of exactly that, and it survived because the word *Safari*
  made a guess sound like a diagnosis. Reproduce in Chrome, and describe behaviour as Chrome's.

  **Reaching for Safari on purpose is fine — that is what a utility browser is for.** Adding a web
  app to the iOS home screen so it launches standalone is Safari-only, and that is how Coffee is
  installed: open it in Safari once, add it, and the installed app is its own thing afterwards. The
  intended path, not a workaround to design away. So do not add a web app manifest to make an app
  Chrome-installable on the strength of this rule alone — that means editing `middleware.ts`, which
  is the password gate in every app and TechPad Gen's call, and it is not what this rule asks for.

  **On iOS every browser is WebKit, Chrome included**, so a WebKit rendering or decoding quirk still
  applies on the phone whichever browser is in front of it. The `<img>` fallback in
  `apps/coffee/lib/image.ts` is there because `createImageBitmap` cannot always decode an iPhone
  HEIC. It protects Chrome on the primary device and is not dead code.

- **Agent isolation.** Never point two Claude Code sessions at the same working directory at the
  same time. One app folder at a time, or genuinely separate worktrees.

**Stack:** Next.js on Vercel · Supabase Postgres · Anthropic API, server-side only ·
techpaddock.io via Cloudflare Registrar.

**Domain map** — project names carry a `tp-` prefix and do not match their folder or subdomain.
That is verified against the live account and the prefix stays; the table gets corrected, not the
projects renamed.

| Subdomain | Tool | Vercel project | Status |
|---|---|---|---|
| `techpaddock.io` | hub (`apps/home`) | `tp-home` | live |
| `editor.techpaddock.io` | Message Editor | `tp-message-editor` | live |
| `tracker.techpaddock.io` | Pipeline Tracker | `tp-tracker` | live |
| `resume.techpaddock.io` | Resume Formatter | `tp-resume` | live |
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` | live |

---

## Why these rules exist

Every one of them was written after something went wrong: three branches editing this file at once,
six schema migrations that lived only in the database, a Vercel project pointed at the repo root
serving an unprotected page to the public, real contact names committed to the file that forbids
committing names, and sixteen merge commits from a single reused branch — fifteen pull requests,
several merged within ten seconds of opening, far too fast for CI to have reported. The gate
existed and was walked straight through.

Most rules here are convention: they hold because an agent chooses to comply. Three things do not,
and it is worth knowing which. `main` is protected in the GitHub UI. The `.claude/settings.json`
hooks run whether or not anyone wants them to — they refuse a push to `main` and a
`supabase migration repair`. And `requested-by-joel` fails a pull request whose body does not record
who asked for it.
Notably **"do not open a pull request until Joel asks" is not one of them.** Nothing mechanical can
tell an asked-for pull request from an unasked-for one, because every agent acts as the same GitHub
account. That rule holds on honesty, and it is the most important convention here for exactly that
reason.
