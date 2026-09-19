# Platform Config — handoff

State as of 2026-09-19.

Read `RULES.md` first, then `supabase/README.md`. This file is only what is true right now.

---

## What is true now

**Deploys are scoped per app.** Each `apps/*/vercel.json` carries an `ignoreCommand` that skips
previews outright and otherwise builds only when that app's own folder or `packages` changed. It
compares `HEAD^ HEAD`, correct *because this repo squash-merges* — one merge is one commit, so
`HEAD^..HEAD` is the whole change. That reverses this file's older note arguing for
`VERCEL_GIT_PREVIOUS_SHA`, which was reasoning about a non-squashed history. Every failure path
exits 1 and builds, so a broken ignore step over-builds rather than silently skipping a deploy.

**`live: false` does not mean paused, and reading it that way has cost a day.** `tp-home` carries
the same field while serving `techpaddock.io`. **The signal is deployment state.** A paused project
returns `BLOCKED`; a skipped preview returns `CANCELED`; a real build returns `READY`.

**`tp-message-editor` returns `BLOCKED` on every deployment, production included.** Measured
2026-09-19 against the last four merges to `main` — `65514a8`, `34d6949`, `c3c40fd`, `f82ebd5` — all
four `BLOCKED` at `target: production`. So `editor.techpaddock.io` serves whatever last succeeded
and **every merge since has silently never reached it**. Joel's to act on. Ledger item 17.

**`tp-tracker` is not paused.** Same four commits, all `READY` at `target: production`, previews
`CANCELED` by the new ignore step. Its daily cron runs. Ledger item 10.

**DNS is uniform.** Every subdomain is a CNAME to `d1317e1174061c29.vercel-dns-017.com`; the apex
stays an A record at `76.76.21.21` because an apex cannot be a CNAME — correct, not a leftover.

**`SESSION_SECRET` parity was confirmed by Joel on 2026-09-14.** The mechanism matters at the next
rotation: values cannot be read back out of the dashboard, so parity cannot be confirmed by
inspection. Setting one fresh known value on all five and then **redeploying** is the only way.

**The database is healthy with one deliberate gap.** Measured 2026-09-19: 17 applied remotely, 16
in `supabase/migrations/`, the single difference being `20260908235234`, withheld because it seeds
real names. **That is correct and permanent, and it must stay the only difference** — a second one
is real drift. Do not repair it; a hook blocks the command and the hook is right.

**Branch protection's required checks are `gate`, `drift` and `requested-by-joel`**, switched
2026-09-16. None change when an app is added or deprecated, so no per-app `build (…)` entry remains.

**`supabase link` has never been run from an agent session** — it needs an access token no agent
should hold. Local files are verified against remote history by normalized hash, not the CLI.

## Traps specific to this seat

- **Environment variables are baked in at build time.** Changing one has no effect until that
  project redeploys. This catches people out constantly.
- **`.claude/DECISIONS.md` is at 260 of 260 lines**, append-only with no trimming rule, so the next
  settled call has nowhere to go. Raising the ceiling is Joel's. **Do not trim it to make room.**
- **Adding a schema is three steps** — the recipe is in `RULES.md` and `supabase/README.md`, not a
  fourth copy here. The one worth carrying: **`postgrest_logs` prints a relation count on every
  reload**, so the Exposed schemas list is checkable without dashboard access.
- **Supabase's value living in a Vercel field.** Both key systems are enabled — legacy `eyJ…` JWTs
  and modern `sb_secret_…` — and the code needs the legacy `service_role` JWT. `Invalid Compact JWS`
  is the decisive tell: a merely *wrong* JWT parses fine and fails differently.
- **No agent can read a branch-protection ruleset.** A leftover required check is invisible from
  here and blocks every pull request until Joel removes it.
- **A new subdomain's CNAME target comes from that project's own Domains tab** — never reused.
- **Before claiming a deployment problem is fixed, check that a deployment actually happened.** A
  configuration that looks right and a build that never ran look identical from the dashboard.
- **If deployments stop again, read `link.org` on the Vercel project before touching GitHub** — the
  one line worth carrying out of the 2026-09-11 outage. The trap itself is in `DECISIONS.md`.

## In flight

`claude/platform-handoff-correction` — this correction. Nothing else.

## Next

1. **`editor.techpaddock.io` is not taking merges** (item 17). Nothing on the platform side fixes
   it; Joel must unblock the project. Then verify with a *new* deployment reaching `READY` at
   `target: production` — not the dashboard's Redeploy, which rebuilds the stale commit.
2. **Run `supabase link` and `migration list` once, locally.** Expect exactly one remote-only
   version. Joel's; it needs an access token no agent should hold.
3. **`editor.model_status` has zero rows.** The Message Editor's table and task, but if it turns
   out to be a grants or RLS problem it becomes yours.
