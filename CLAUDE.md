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
  anything touching `SESSION_SECRET` and the shared cookie. These are byte-identical copies in five
  apps and a mismatch does not throw. It silently rejects valid sessions on the other four.
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

- One branch per change, named for the change. Never reuse a branch across unrelated work, and
  never treat one as a permanent working branch.
- State your blast radius in the pull request: which apps, which shared files.
- Add any new app under `apps/` to the CI matrix in `.github/workflows/ci.yml` in the same pull
  request. The matrix is hardcoded to five names and silently skips anything else, so a new app
  ships untested and nothing tells you.
- Keep your worklog current. It carries what a commit cannot: what you are doing right now, what
  you are blocked on, what you decided that affects someone else, what you need from the TD.
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
- **The browser is Chrome, on desktop and on the phone. Do not diagnose against Safari, and do not
  reach for it as an explanation.** Every report here comes from Chrome unless it explicitly says
  otherwise. A theory resting on Safari, WebKit third-party cookie partitioning or ITP is a theory
  about a browser nobody here is using — the mobile login bug already cost one round of exactly
  that, and it survived because the word *Safari* made a wrong explanation sound like a diagnosis.
  Reproduce in Chrome, and describe behaviour as Chrome's.

  **Two places the platform genuinely forces WebKit. Neither is licence to bring Safari back as an
  explanation.** On iOS every browser is WebKit, Chrome included, so a WebKit *rendering or decoding*
  quirk still applies on the phone — the `<img>` fallback in `apps/coffee/lib/image.ts` is there for
  that and is not dead code, so do not delete it on the grounds that we use Chrome. And adding a web
  app to the iOS home screen so it launches standalone is a Safari-only mechanism, which is what
  Coffee's install path depends on: an Apple constraint, not a browser preference. When you hit one
  of these, name the constraint. Do not name Safari anywhere else.

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
| `coffee.techpaddock.io` | Coffee | `tp-coffee-app` | built, not yet deployed |

---

## Why these rules exist

Every one of them was written after something went wrong: three branches editing this file at once,
six schema migrations that lived only in the database, a Vercel project pointed at the repo root
serving an unprotected page to the public, real contact names committed to the file that forbids
committing names, and sixteen merge commits from a single reused branch — fifteen pull requests,
several merged within ten seconds of opening, far too fast for CI to have reported. The gate
existed and was walked straight through.

Until `main` is protected in the GitHub UI, every rule here is convention rather than enforcement.
The `.claude/settings.json` hooks are the only part that does not depend on an agent choosing to
comply.
