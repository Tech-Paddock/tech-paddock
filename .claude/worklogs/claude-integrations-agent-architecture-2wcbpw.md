# claude-integrations-agent-architecture-2wcbpw
agent: tech-paddock-79 (technical director) · apps: none · shared files: CLAUDE.md, .claude/, supabase/

## 2026-09-11 16:30 — claim
Working on: audit of the Vercel / Supabase / GitHub / Cloudflare integration surface, then fixing
what the audit found.
Touching: `supabase/`, `CLAUDE.md`, `.claude/worklogs/`
Depends on: nothing

## 2026-09-11 17:10 — landed
Backfilled the Supabase migration history. Six migrations checked in at `supabase/migrations/`,
copied out of the applied remote history and verified against it by normalized hash. Moved the
resume migration up from `apps/resume/` — one project, one history. The seed migration is
deliberately absent because it contains real names; `supabase/README.md` explains why and says not
to "repair" the gap it leaves.

## 2026-09-11 18:00 — landed
Rules of Engagement in `CLAUDE.md`, this worklog channel, the TD ledger, Domain Map corrected to
the real Vercel project names, `position` added to the contacts table. Merged #16 first so its
policy text could be superseded rather than land on top of these rules.

## 2026-09-11 18:15 — handoff
Landed: the Pit Wall board, at
https://claude.ai/code/artifact/9cac3618-1a51-4d5e-82fb-339e96657bf4 — deployments, CI, branches
and the ledger on one page, fed from the artifact's datastore. It cannot poll anything; it is as
fresh as the TD's last write and reports its own age for exactly that reason.
Open: two follow-on PRs not yet opened — Node runtime drift, and the PII scrub in the resume app.
Three branches to delete once their queue position passes.
Need from TD: nothing. Items needing Joel are in `_open-items.md`.

## Note on this branch's own PR

Opened but deliberately not self-merged. These are the rules that constrain the technical
director, and the TD approving them alone is the wrong shape regardless of green CI.

## Note for whoever picks up `tracker-dashboard` or `coffee`

Both branches edit `CLAUDE.md`, and so did this one. Rebase before you assume your section is
still where you left it. `coffee` additionally proposes renaming the Vercel projects to bare names
— that was declined, the `tp-` prefix stays, and the table has been corrected to match the live
account. Drop that section before merging.

## 2026-09-11 21:00 — final handoff

Landed nine PRs, #16 through #25. `main` now carries five apps, five CI jobs, eight checked-in
migrations, the Rules of Engagement, this worklog channel, nine agent briefs, and three hooks that
enforce rather than ask.

The two finds worth remembering, neither of which would have surfaced on its own:

- The database was the only record of its own shape. Six of seven migrations existed nowhere else.
- A new Postgres schema inherits no grants, so `coffee` would have deployed clean, passed CI, and
  failed at runtime on permissions. The trap was set by a migration written before that app existed.

The mistake worth remembering: I blocked the `/api/summary` branch on a concern formed from reading
design notes rather than code, and I was wrong. It is recorded as wrong in the ledger rather than
quietly dropped.

Open: nothing of mine. Everything left is Joel's — `tp-coffee-app` repointing, the Microsoft env
vars, `build (coffee)` in the required checks, and `supabase link`. All in `_open-items.md`.

Need from TD: nothing. This was the TD's branch.

## 2026-09-11 21:45 — claim

Working on: restructuring the agent documentation. `CLAUDE.md` becomes highest-level only — how to
interact, universal rules, and routing. Each of the eight agents gets `RULES.md` (charter and
guardrails), `HANDOFF.md` (current state) and `KICKOFF.md` (the prompt that starts the session).
Touching: `CLAUDE.md`, `.claude/agents/`, and eventually `.claude/handoff/` which this replaces.
Depends on: nothing. Joel approved the `CLAUDE.md` restructure directly.

Partial as committed: foundation plus `message-editor` only. Seven agents still to write, and the
old `.claude/handoff/` briefs are still in place — `CLAUDE.md` currently routes to charters that do
not exist yet. **Not mergeable in this state.**

Decision affecting others: universal rules stay in `CLAUDE.md` alone and are not copied into eight
charters. Eight copies would drift silently, which is the same failure as `lib/auth.ts` being
byte-identical in five apps. Each charter carries only what is specific to it.

Need from TD: Joel to ratify three Message Editor brief changes the agent raised rather than made —
tone as a picklist, the Effort toggle never built, and the new Context input. All three are merged
and live; none is approved. Recorded in that agent's handoff as pending, not as settled.
