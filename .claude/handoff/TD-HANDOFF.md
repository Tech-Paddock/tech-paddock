# TD handoff — state as of 2026-09-11, end of day

Read `TD-ONBOARDING.md` first for the role. This is the workload.

**Board:** https://claude.ai/code/artifact/9cac3618-1a51-4d5e-82fb-339e96657bf4 — deployments, CI,
branches and open items as a page. It does not poll anything; it is exactly as fresh as the last
time a TD wrote to it and says so on its own face. When the age readout is amber or red, check
Vercel and GitHub directly rather than trusting it.

**Start here:** `bash .claude/worklogs/read-all.sh`, then lead your first message with the open
items from `_open-items.md`. A `SessionStart` hook now prints that ledger into your context
automatically, so it should already be there.

---

## The queue is clear

Nine pull requests merged on 2026-09-11, #16 through #25. Nothing is in flight. `main` carries five
apps, five CI jobs, eight checked-in migrations, the Rules of Engagement, the worklog channel, nine
agent briefs, and three hooks.

Four branches remain. One is live work — `claude/message-editor-agent-wetwv6`, holding an agent's
`contacts.position` change. The other three are superseded and safe to delete.

---

## Waiting on Joel

Live infrastructure and one-time credentials. None of it is the TD's to do.

1. **Repoint `tp-coffee-app`.** `apps/coffee` is on `main`, so this is unblocked. Root Directory →
   `apps/coffee`, framework → Next.js, env vars including `ANTHROPIC_API_KEY`, attach
   `coffee.techpaddock.io`. **Until then it serves an empty page publicly, outside the password
   gate** — the only exposed thing on this list, and the reason it is first.
2. **Set `MS_GRAPH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` and `CRON_SECRET`** on `tp-tracker`.
   The Microsoft To Do integration and daily cron shipped in #22 and are **inert** without them.
   They degrade quietly by design, so nothing will tell you they are doing nothing. Needs a
   one-time Azure app registration against a personal Microsoft account.
3. **Add `build (coffee)` to branch protection's required checks.** The matrix is five jobs; the
   rule still names four.
4. **Run `supabase link` and `migration list` once, locally.** Three commands in
   `supabase/README.md`. Expect eight local files matching remote, with `20260908235234` showing
   remote-only — that gap is deliberate. Do not repair it.

---

## Open decisions

**The org transfer.** Deferred. The repo sits on `joelb-401`, which means branch protection is
probably inert and the hooks are doing the real work. Before moving it back to `Tech-Paddock`:
install Claude's **and** Vercel's GitHub Apps on the org first, stop every running session, then
move. In that order. The post-mortem is in the ledger and cost about two hours to learn.

**A word with the Message Editor agent.** It is live and doing the right work — it wired up
`contacts.position`, the first item in its brief. It also edits `CLAUDE.md` and keeps no worklog,
both of which the rules forbid. Worth telling it rather than fixing underneath it; rewriting a live
agent's branch is how you lose work.

---

## Known, deliberately not fixed

- **Every push rebuilds every Vercel project.** No Ignored Build Step on any of the five, so a
  docs-only commit triggers five builds. Cheap to fix, never urgent.
- **DNS is wired two ways.** `editor` resolves through the modern `vercel-dns-017.com` target; the
  others use the legacy `76.76.21.21` A record. Both work.
- **`/api/health` sits behind the password gate**, so no external uptime monitor can reach it. Fine
  for human use; a blocker if it is ever meant for monitoring.
- **`editor.model_status` has zero rows.** The login-time model drift check has never successfully
  written. Either nobody has logged in since it shipped, or it is failing quietly. Not diagnosed,
  and it is the oldest unexplained thing here.
- **The board's wake subscription failed to register** (`mint_failed`). Nothing wakes on republish.

---

## Two things a successor should read rather than rediscover

**A new Postgres schema inherits no grants.** `20260910051549` granted USAGE by naming four schemas
explicitly, so `coffee` arrived unreadable even by `service_role`. It would have deployed clean,
passed CI, and failed at runtime on permissions with nothing in its own code to explain why. Fixed
by `20260911203100`; the rule is now in `supabase/README.md`.

**The `/api/summary` flag was wrong, and it was the TD's error.** It was raised as widening
`INTERNAL_API_SECRET` into a shared key across four apps. Reading the code rather than the design
notes: the carve-out is one exact path, mirrors the editor's existing `/api/draft` precedent, is
read-only and fails closed. It is recorded as mistaken rather than quietly dropped, because a
withdrawn concern with no explanation teaches nothing and invites the same mistake.

The general lesson, worth carrying: **verify from the code, not from the summary of the code.**
