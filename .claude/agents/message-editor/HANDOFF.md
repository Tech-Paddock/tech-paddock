# Message Editor — handoff

State as of 2026-09-19.

Read `RULES.md` first. It is the specification, and this file deliberately does not repeat it —
the tool's shape, the three settled decisions, the `/api/draft` contract and the traps all live
there, once. This is only what is true right now.

---

## What is true now

**Nothing this agent built has changed since 2026-09-16.** Commits have touched `apps/editor` since
and none of them was this agent's: the livery beside the page title (#131), hairline contrast
(#125), the three security headers (#134), `.env.example` (#123) and `vercel.json` twice
(#108, #137). The app's *behaviour* is where 09-16 left it; its chrome and its deploy config are
not. That gap is what a freshness warning cannot see, which is why it is written here.

**Do not assume a merge reaches the app — measure it.** `tp-message-editor` is paused: every
deployment returns `BLOCKED`, the production target included, measured 2026-09-19 against the
current head of `main`. `editor.techpaddock.io` serves whatever last succeeded, so the merges since
have not reached it. **Whether the pause is deliberate is Joel's to say and the project is his** —
it is not a bug to chase, and not something to route around. Read `/admin` and the project's
deployment state rather than believing this paragraph's date.

**`editor.model_status` still has zero rows.** Recorded in `.claude/DECISIONS.md`, not on the
ledger. `lib/modelCheck.ts` is unchanged since the day it landed. Its upsert is unconditional once
reached, so zero rows means execution never gets there or the upsert itself errors — and every path
out is silent: the function returns on a missing API key and on any `models.list()` failure, and
`/api/login` calls it as `runModelDriftCheck().catch(() => {})`. **Table shape is ruled out** — the
upsert's columns match `20260910215015_create_editor_model_status.sql` exactly.

**There is still no `test` script**, so CI's `npm run test --if-present` does nothing here.
`editor` and `home` are the apps without one.

**Train mode has never folded a real batch.** No writing samples have been loaded, so the style
guide is still the seed rules.

## In flight

**`claude/message-editor-kickoff-2mmhm3`** — this handoff and nothing else. It is the harness-named
opening branch rather than a `claude/editor-<description>` one, because the session is pinned to
that name; the deviation is named in the pull request.

**That ref was rebuilt from `origin/main` on 2026-09-19 before anything was written to it.** It had
been carrying the pre-rebuild history, with **no merge base** against current `main` at all. Any
branch cut from the old ref will be disjoint the same way — start from `origin/main`.

## Open, and not this agent's to close

**Ledger item 5 — `shared.contacts` needs its other owner named.** The recommendation went to the
technical director on 2026-09-19: the Pipeline Tracker is a **reader, not a writer**. Its own
`app/api/contacts/route.ts` says so in a comment and no tracker path writes the table, so the
Message Editor is already the sole writer, nothing has to move, and no migration is owed by the
deprecation. Naming it is a charter edit, so it is Joel's yes.

**Popping the editor out into the Chrome window Joel works in.** He asked; the options were put to
him and he has not answered, so nothing was built and no branch was cut. The technical director was
asked to put it on the ledger. **That analysis was made against the pre-rebuild tree and its file
references need re-checking before any of it is quoted** — `next.config.mjs` has gained two headers
since.

## Next

1. **Diagnose `editor.model_status`.** Still the highest-value task and the oldest unexplained thing
   in the project. Confirm whether `/api/login` reaches `lib/modelCheck.ts` at all before touching
   anything else. If it lands on grants or RLS it becomes Platform's.
2. **Add a `test` script.** It opts the app into CI's test step with no CI change.
3. Nothing else is queued. Ask before starting anything larger than a fix.
