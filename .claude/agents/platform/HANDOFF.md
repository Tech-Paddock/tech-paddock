# Platform Config — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## The deploy outage is closed — read this before you touch Vercel

**Fixed 2026-09-12 at 00:40.** All five projects serve `0c7d882` (#33); `techpaddock.io` returns 200
from that deployment with the password gate intact. It ran six hours and forty minutes.

There were **two** causes, and only the first was diagnosed here originally.

**One: the GitHub App installation.** The repo moved to the `Tech-Paddock` org and the installation
did not travel with it — a GitHub App is installed on an *account*, not a repository. An earlier
version of this file said the repo moved to the org *and back to `joelb-401`*. It did not; it is
still org-owned, id `1358809705`, owner type Organization. That one wrong word sent the fix to
`github.com/settings/installations`, a personal-account page that cannot reach an org-owned repo.

**Two, and this is the one that was missed: the project's git link is stored on the Vercel project,
not derived from the installation.** After the org installation was in place, a push at 00:12 reached
GitHub, ran CI, and produced **zero** deployments. All five projects still recorded
`link.org: "joelb-401"`, and nothing on the GitHub side could rewrite it — removing the personal
installation changed nothing. The fix was per project, in **Vercel's own Settings → Git**:
disconnect, then reconnect to `Tech-Paddock/tech-paddock`.

What proved the installation itself was sound was an accident: a sixth project, created from
Vercel's import flow at 00:16, deployed current `main` to production two seconds later carrying
`githubOrg: Tech-Paddock`. That separated "Vercel cannot see the repo" from "Vercel is looking in the
wrong place", which look identical from outside. The project has since been deleted.

Verified after the five reconnects: every custom domain survived — `techpaddock.io`,
`editor.`, `tracker.`, `resume.` all still attached, and `tp-coffee-app` still holds
`tech-paddock.vercel.app`.

**If deployments stop again, read `link.org` on the project before touching anything on GitHub.**

Ruled out along the way, read from the files rather than a summary of them: the Hobby plan's
100-deploys-per-day cap (no banner), and `git.deploymentEnabled: false` and the legacy
`github.enabled: false` — neither appears in any of the five `vercel.json`, and there is no root
`vercel.json`.

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
files, so every project rebuilds. Note the backlog argument that used to sit here is spent: the
outage is fixed and all five have deployed `0c7d882`, so this change is now worth landing on its own
merits — five full Next.js builds per docs-only commit — rather than as a way to clear a backlog.

## `tp-coffee-app` is partly configured, and it is the only public exposure

Joel worked on it at **23:31** — the project's `updatedAt` moved. Two things are **verifiably still
outstanding**, and two cannot be checked from a session at all:

| Setting | State at 23:45 |
|---|---|
| `framework` | still `null` — not set to Next.js |
| domains | `coffee.techpaddock.io` **not attached**; only the three `.vercel.app` names |
| Root Directory | **wrong** — verified 2026-09-12 from the build log, see below |
| the five env vars | **not exposed by the Vercel API** — unknowable from here |

**Root Directory is checkable from a session after all — read the build log.** An earlier version of
this table called it unknowable, which was wrong and left the worst of the four unverified. A build
against the correct Root Directory installs dependencies and runs `next build`; a build against the
repo root finds no `package.json` and exits in milliseconds. On 2026-09-12 `tp-coffee-app` produced:

```
Running "vercel build"
Build Completed in /vercel/output [310ms]
Skipping cache upload because no files were prepared
```

against `tp-home` on the same push installing 31 packages and detecting Next.js 14.2.35. So
**`tp-coffee-app` is still pointed at the repo root**, and that — not the framework preset — is
what keeps `tech-paddock.vercel.app` serving an ungated page — checked 2026-09-12, and it is a bare
84-byte 404 with no data and no repo contents, so it is embarrassing rather than dangerous. Root
Directory must be `apps/coffee`, and it only takes effect on the next build, so a push has to follow
the change. Re-confirmed after #33 deployed: still a repo-root build.

The framework preset is close to cosmetic by comparison: `apps/coffee/vercel.json` already declares
`"framework": "nextjs"`, and `tp-message-editor` has deployed correctly for weeks with `framework:
null`. Worth setting, but it was never the blocker this file implied.

For the environment variables, `GET /api/health` on the deployed app is the check — it landed in #31
and names which dependency is unhappy. A green build proves nothing, because the variables are read
per request rather than at build time. The five the app actually reads, confirmed from the source
rather than from CI's dummy list: `ANTHROPIC_API_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

**The Cloudflare DNS is already done.** `coffee.techpaddock.io` resolves to `76.76.21.21`, a real A
record rather than a wildcard — confirmed because a nonsense subdomain on the same zone does not
resolve. Only the Vercel-side attachment remains.

Until Root Directory points at a real app, `tech-paddock.vercel.app` serves an empty page
**outside the password gate** — the gate lives in each app's middleware, so a project with no app
has no gate. That is why this is first on the list. Joel's decision stands: **fix in place, do not
delete.**

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

- **DNS is uniform as of 2026-09-12, and this entry is retired.** Joel moved all four subdomains to
  CNAMEs on `d1317e1174061c29.vercel-dns-017.com` at 01:39; verified resolving, and all four still
  return 200 with `frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` intact.
  The apex `techpaddock.io` stays an A record at `76.76.21.21` — an apex cannot be a CNAME, so that
  is correct rather than an oversight. `coffee.techpaddock.io` is attached and resolving too.
- **`/api/health` on the resume app sits behind the password gate**, so no external uptime monitor
  can reach it. Fine for human use; a blocker if it is ever meant for monitoring.
- **`build (coffee)` is not in branch protection's required checks.** The matrix is five jobs; the
  ruleset still names four. `main` now reports `protected: true` on the org, checked 2026-09-12,
  which supersedes the old note that protection is inert on a personal account — but no agent can
  read rulesets, so which checks are required is unverifiable from a session.

## Next steps, in order

1. Confirm the Vercel GitHub App installation. Nothing else you own can be verified until pushes
   deploy again.
2. Land the `ignoreCommand` change; it clears the backlog in the same push.
3. Repoint `tp-coffee-app` and close the public exposure.
4. Verify `SESSION_SECRET` parity across all five, after a redeploy.
5. Add `build (coffee)` to the required checks.
