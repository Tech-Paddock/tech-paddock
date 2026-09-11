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
