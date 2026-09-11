# Platform Config — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## Production has not deployed since 17:48 today

**This is the biggest live problem in the project and it is yours.**

Every one of the five Vercel projects last deployed production at **17:48 UTC**, commit `92c1ec1`
(PR #16). The last deployment of any kind was a preview at 17:54. Since then **eleven pull requests
have merged to `main` and none has deployed.**

The evidence, so you do not re-derive it:

```
17:48:28   last production deploy (#16)
17:49:01   tp-resume         project settings modified
17:49:30   tp-message-editor project settings modified
17:49:57   tp-tracker        project settings modified
17:50:23   tp-home           project settings modified
17:50:26   tp-coffee-app     project settings modified
17:54:49   last deployment of any kind
           ... nothing, across 11 merges
```

Five separate projects do not modify their own settings within 85 seconds of each other. That is one
account-level event rippling through all of them, and the thing that rewrites every project's stored
git link at once is **the repository changing hands**. The repo was transferred to the `Tech-Paddock`
org and back to `joelb-401` in that window.

**Diagnosis: Vercel's GitHub App installation did not survive the transfer.** A GitHub App is
installed on an *account*, not on a repository; the repo left the installation's scope and came back
to an account whose installation no longer covers it. Nothing errors. Pushes succeed, GitHub Actions
still runs (it is built into GitHub, not an installed app), and Vercel simply never hears about it.

Ruled out along the way: the Hobby plan's 100-deploys-per-day cap — Joel checked the dashboard and
there is no limit banner — and `git.deploymentEnabled: false`, which appears in none of the five
`vercel.json` files.

**The fix:** `github.com/settings/installations` → Vercel → confirm it exists and that
`tech-paddock` is in its repository access list. Then a new push against current `main` is needed;
do **not** use the dashboard's Redeploy button on the existing production deployment, because that
rebuilds `92c1ec1` — the same stale code.

## Ignored Build Step — agreed, written, not landed

Every push rebuilds all five projects because no project has an Ignored Build Step. A docs-only
commit triggers five full Next.js builds.

The apps are cleanly separable: there are **no imports crossing between apps** and nothing outside
`apps/*` feeds a build, so "did anything in my folder change" is a complete and correct question.
Tracker→editor and hub→tools are runtime HTTP calls, not build-time dependencies.

The agreed change is one line in each app's existing `vercel.json`:

```json
"ignoreCommand": "git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD ./"
```

Exit 0 skips the build, exit 1 runs it — inverted from intuition, because `git diff --quiet` exits 0
when there are no changes. `./` resolves to the project's Root Directory.

`VERCEL_GIT_PREVIOUS_SHA` rather than Vercel's documented `HEAD^` example: `HEAD^` examines only the
single most recent commit, so when two pushes land close together the older one's changes are
skipped and never deploy. `VERCEL_GIT_PREVIOUS_SHA` is that project's last *successful deployment*,
which is what you actually want to compare against. It is only populated when an ignore step is
configured, hence the fallback.

**One thing was not confirmed and should not be assumed:** whether a skipped deployment still counts
against the Hobby daily cap. Vercel's documentation does not say. It certainly stops five real
builds per push.

Merging this is also the cleanest way to clear the backlog — it touches all five `vercel.json`
files, so every project rebuilds and `VERCEL_GIT_PREVIOUS_SHA` still points at `92c1ec1`, meaning
each project sees the full accumulated diff.

## `tp-coffee-app` is still wrong, and it is the only public exposure

Root Directory points at the **repo root** rather than `apps/coffee`. It builds nothing and serves
an empty page publicly at `tech-paddock.vercel.app`, **outside the password gate** — the gate lives
in each app's middleware, so a project with no app has no gate.

`apps/coffee` has been on `main` since #23, so nothing blocks this any more. Joel's decision stands:
**fix in place, do not delete.**

Needed: Root Directory → `apps/coffee`; framework → Next.js (currently `null`); five environment
variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`,
`ANTHROPIC_API_KEY`); then attach `coffee.techpaddock.io`.

The moment Root Directory points at a real app, that URL starts running the app's middleware and the
public exposure closes. That is the reason this is first on the list.

Note: `tp-message-editor` also shows `framework: null`, though it has been deploying correctly via
its own `vercel.json`. Worth setting for consistency; not urgent.

## `SESSION_SECRET` was rotated today — verify parity

A fresh `SESSION_SECRET` was generated on 2026-09-11 because the existing value could not be read
back out of the dashboard. It was handed to Joel to set on all five projects.

**Nobody has verified that it landed on all five, or that all five have redeployed since.** Given
that deployments are broken, it is likely that *none* have picked it up.

This is the exact condition that produces the silent-SSO failure. Verifying parity across all five —
and that each has actually redeployed since the change — is the first thing to do once deployments
work again.

## Database: healthy, one gap

Nine migrations applied, eight checked in. The ninth (`20260908235234`) is deliberately withheld
because it seeds real names. **Do not repair it.** A hook blocks the command.

`coffee.bags` exists with RLS enabled and zero rows. The grants migration `20260911203100` is
applied, so the schema is reachable by `service_role`. `supabase/config.toml` lists all five
schemas.

**`supabase link` has never been run** against the remote from any agent session — it needs an
access token no agent should hold, so Joel runs it locally. The local files were verified against
remote history **by normalized hash**, not by the CLI. Expect `migration list` to show eight local
matching remote with `20260908235234` remote-only. That gap is correct.

**`editor.model_status` has zero rows.** The Message Editor's login-time drift check has never once
successfully written. It is that agent's table and that agent's task, but if it turns out to be a
grants or RLS problem it becomes yours.

## Done today, do not redo

- **Node runtime drift: fixed (#20).** CI moved 20 → 24 to match what all five projects run, and
  `engines: >=24` is declared. Verified that the constraint warns rather than breaks on Node 22.
- **`coffee` grants: fixed (#20260911203100).**
- **`config.toml`: all five schemas listed.**

## Known, deliberately not fixed

- **DNS is wired two ways.** `editor` resolves through `vercel-dns-017.com`; the other three use the
  legacy `76.76.21.21` A record. Both work. Switching is hygiene, not a problem — and if you do,
  take each target from that project's own Domains tab.
- **`/api/health` on the resume app sits behind the password gate**, so no external uptime monitor
  can reach it. Fine for human use; a blocker if it is ever meant for monitoring.
- **`build (coffee)` is not in branch protection's required checks.** The matrix is five jobs; the
  ruleset still names four. Branch protection is also probably inert while the repo sits on a
  personal account.

## Next steps, in order

1. Confirm the Vercel GitHub App installation. Nothing else you own can be verified until pushes
   deploy again.
2. Land the `ignoreCommand` change; it clears the backlog in the same push.
3. Repoint `tp-coffee-app` and close the public exposure.
4. Verify `SESSION_SECRET` parity across all five, after a redeploy.
5. Add `build (coffee)` to the required checks.
