# Platform Config — handoff

State as of 2026-09-16.

Read `RULES.md` first, then `supabase/README.md`. This file is only what is true right now.

---

## What is true now

**All five projects deploy and all five domains serve.** `techpaddock.io`, `editor.`, `tracker.`,
`resume.` and `coffee.` all return 200 behind the password gate. The six-and-a-half-hour outage of
2026-09-11 is long closed; its cause is a trap in `.claude/DECISIONS.md` and the one line worth
carrying is **if deployments stop again, read `link.org` on the Vercel project before touching
anything on GitHub.**

**DNS is uniform.** All four subdomains are CNAMEs to `d1317e1174061c29.vercel-dns-017.com`. The
apex stays an A record at `76.76.21.21` because an apex cannot be a CNAME — correct, not a leftover.
All four still send `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io`.

**`SESSION_SECRET` parity was confirmed by Joel on 2026-09-14.** The mechanism matters at the next
rotation: the values cannot be read back out of the dashboard, so parity cannot be confirmed by
inspection. Setting one fresh known value on all five and then **redeploying** is the only way to
establish it.

**The database is healthy with one deliberate gap.** Every migration in `supabase/migrations/` is
applied, plus exactly one that is not in it: `20260908235234` is withheld because it seeds real
names, so `migration list` will always show it as remote-only. **That is correct and permanent, and it should be the only difference** — a second one
means real drift. Do not repair it; a hook blocks the command.

**`supabase link` has never been run from an agent session** — it needs an access token no agent
should hold. Local files were verified against remote history by normalized hash, not by the CLI.

## Traps specific to this seat

- **Environment variables are baked in at build time.** Changing one has no effect until that project
  redeploys. This catches people out constantly.
- **Adding a schema is three steps, not two**: the schema and its tables with RLS, a grants
  migration, and the hosted project's **Exposed schemas** list in the dashboard. Step three lives
  nowhere in this repo and fails looking exactly like a credentials problem — it cost an hour.
  **Checking it without dashboard access:** `postgrest_logs` prints a relation count on every
  reload; count the tables you expect exposed and compare.
- **Supabase's value living in a Vercel field.** The project has both key systems enabled — legacy
  `eyJ…` JWTs and modern `sb_secret_…` — and the code needs the legacy `service_role` JWT.
  `Invalid Compact JWS` is the decisive tell, because a merely *wrong* JWT parses fine and fails
  differently.
- **Branch protection's required-checks list is separate from the CI matrix** and does not update
  itself. When the matrix changes, the ruleset needs the same change by hand. No agent can read
  rulesets to verify it.
- **If you switch a subdomain to a CNAME, take the target from that project's own Domains tab.** The
  per-project hashed targets are not interchangeable.
- **Before claiming a deployment problem is fixed, check that a deployment actually happened.** A
  configuration that looks right and a build that never ran look identical from the dashboard.

## In flight

Nothing.

## Next

1. **Land the `ignoreCommand` change.** Every push still rebuilds all five Vercel projects — a
   docs-only commit triggers five full Next.js builds. #57 fixed the GitHub Actions half only. One
   line in each app's existing `vercel.json`:

   ```json
   "ignoreCommand": "git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD ./"
   ```

   Exit 0 skips, exit 1 builds — inverted, because `git diff --quiet` exits 0 when nothing changed.
   Use `VERCEL_GIT_PREVIOUS_SHA`, not Vercel's documented `HEAD^`: `HEAD^` examines only the latest
   commit, so when two pushes land close together the older one's changes never deploy. Do not plan
   around the dashboard's *Skip deployments* toggle — see `.claude/DECISIONS.md`.
2. **Add `build (coffee)` to branch protection's required checks** if it is still missing. The matrix
   is five jobs and the ruleset has been one short. Joel's to set; you cannot read it back.
3. **Run `supabase link` and `migration list` once, locally.** Expect one remote-only version.
4. **`editor.model_status` has zero rows.** It is the Message Editor's table and task, but if it
   turns out to be a grants or RLS problem it becomes yours.
