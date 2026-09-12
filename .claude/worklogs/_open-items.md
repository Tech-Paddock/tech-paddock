# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

**Last reviewed: 2026-09-12 00:45 UTC.**

Detail lives in the agent handoffs — `.claude/agents/<agent>/HANDOFF.md`. This file is the index
and the things that belong to nobody else.

---

## Blocking everything else

Nothing. The deploy outage is closed — see the first entry under "Done" below.

## Waiting on Joel

1. **2026-09-12 — Finish `tp-coffee-app`. Root Directory is the one that matters.** Re-verified
   after the outage was fixed: the project deployed `0c7d882` to production and *still* built the
   repo root. **Root Directory must be set to `apps/coffee`**, and it only takes effect on the next
   build, so a push has to follow the change. That — not the framework preset — is why
   `tech-paddock.vercel.app` serves a page outside the password gate. Checked: it returns a bare 404,
   84 bytes, no data and no repo contents. Embarrassing rather than dangerous, so it is not blocking.
   Also outstanding: `coffee.techpaddock.io` is still not in the domain list (the Cloudflare A record
   already exists), and the framework preset is `null` — near-cosmetic, since
   `apps/coffee/vercel.json` already declares `nextjs` and `tp-message-editor` has deployed correctly
   for weeks with the same `null`.
   The five environment variables it actually reads, from the source rather than CI's dummy list:
   `ANTHROPIC_API_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_URL`. They stay API-invisible; `GET /api/health` on the deployed app checks them.
   **Root Directory is checkable from a session — read the build log.** A correct build installs
   dependencies and runs `next build`; a repo-root build finds no `package.json` and exits in
   milliseconds. Earlier entries called this impossible and were wrong.
   **The Cloudflare DNS is already done**: `coffee.techpaddock.io` has a real A record at
   `76.76.21.21`, confirmed not a wildcard because a nonsense subdomain on the same zone does not
   resolve. Only the Vercel-side attachment remains.
   **This is still the only publicly exposed thing in the project** until Root Directory points at a
   real app: `tech-paddock.vercel.app` serves an empty page outside the password gate, because the
   gate lives in each app's middleware and a project with no app has no gate.
2. **2026-09-12 — Verify `SESSION_SECRET` parity across all five. Now checkable, and untested.**
   It was rotated on 09-11 because the old value could not be read back out of the dashboard, and
   nobody has confirmed it landed everywhere. All five have now redeployed, so the behavioural check
   finally works: log in at `techpaddock.io`, then open a tool from a hub tile. A login loop means
   the secret did not land on that app. No agent can read the values — this one is Joel's eyes only.
   A partial rollout is the silent-SSO failure: no error anywhere, just the loop.
3. **2026-09-11 — Set `MS_GRAPH_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` and `CRON_SECRET`** on
   `tp-tracker`. Shipped in #22 and inert without them. They degrade quietly by design, so nothing
   will tell you they are doing nothing. Needs a one-time Azure registration against a personal
   Microsoft account — the `consumers` authority, scopes `offline_access Calendars.Read
   Tasks.ReadWrite`, and one by-hand authorization-code exchange to mint the refresh token, since the
   code only ever does `grant_type=refresh_token`.
   **Order matters, and it is a trap** (found 2026-09-12 by reading the route). The tracker's
   middleware exempts `/api/cron/*` from the password gate outright, and the route guards itself with
   `if (secret && ...)` — which fails **open** when `CRON_SECRET` is unset. That is harmless today
   only because `graphConfigured()` is false and the route answers "Outlook is not connected". Set
   the three `MS_GRAPH_*` values without `CRON_SECRET` and it becomes an unauthenticated public
   endpoint that creates To Do items in a personal Microsoft account on demand. **Set `CRON_SECRET`
   first, or in the same save. Never after.**
4. **2026-09-11 — Add `build (coffee)` to branch protection's required checks.** The matrix is five
   jobs; the rule names four.
5. **2026-09-11 — Run `supabase link` and `migration list` once, locally.** Needs an access token no
   agent should hold. Expect eight local matching remote with `20260908235234` remote-only. That gap
   is deliberate. Do not repair it — a hook blocks the command.
## Done since this ledger was last written

- **2026-09-12 — THE DEPLOY OUTAGE IS CLOSED.** Production had not deployed since 17:48 on 09-11.
  All five projects now serve `0c7d882` (#33); `techpaddock.io` returns 200 from that deployment
  with the password gate intact. Six hours and forty minutes.
  **Two causes, and the second is the one the documentation missed.** Vercel's GitHub App
  installation did not survive the repo moving to the `Tech-Paddock` org, and installing it on the
  org did *not* fix it on its own — a push at 00:12 reached GitHub, ran CI, and produced zero
  deployments. **A project's git link is stored on the Vercel project, not derived from the
  installation.** All five still recorded `link.org: "joelb-401"`, and nothing on the GitHub side
  could rewrite that; removing the personal installation changed nothing. Each project had to be
  disconnected and reconnected to `Tech-Paddock/tech-paddock` in Vercel's own Settings → Git.
  What proved the installation itself was sound was an accident: a sixth project created from
  Vercel's import flow deployed current `main` two seconds after it was made. That project has since
  been deleted. Every custom domain survived the five reconnects.
  **If this happens again, check the project's `link.org` before touching anything on GitHub.**

- **2026-09-11 — PR #28 closed and all dead branches deleted.** The queue is empty: zero open pull
  requests, and `main` plus one docs branch is the whole branch list.
- **2026-09-11 — Coffee has `GET /api/health`** (#31). Reachable after login, it names which
  dependency is unhappy — the `coffee` schema, the `coffee-files` bucket, or a missing
  `ANTHROPIC_API_KEY`. It exists because the build succeeds whether or not the five environment
  variables are right, so a green deploy proves nothing about the configuration. The Anthropic check
  is presence and shape only and reports "set", never "working".
- **2026-09-11 — The two orphaned worklogs were deleted**, by Joel, directly on `main`. The rule is
  now written down in `.claude/worklogs/README.md`: a worklog dies with its branch.

## Decisions made, so they are not reopened

- **2026-09-11 — Google Tasks → Microsoft To Do: APPROVED.** One Azure registration serves both
  calendar and tasks; Google would have meant a second OAuth setup for no extra capability.
- **2026-09-11 — The `tp-` prefix on Vercel project names STAYS.** A proposal to rename live
  projects to bare names was declined. The table was corrected instead.
- **2026-09-11 — Supabase + Vercel Config agents MERGED into Platform Config.** The seam between
  them leaked: the database's credentials live in Vercel.
- **2026-09-11 — PR #27's three brief contradictions: RATIFIED.** Tone as a picklist, the Effort
  toggle deliberately not built, the Context input. Settled; recorded in the Message Editor charter.

## Mistakes, recorded so they are not repeated

- **2026-09-11 — PR #27 was merged when it should have been held.** It contradicted three settled
  decisions in the brief. Every first-order check passed — clean rebase, worklog opened, `CLAUDE.md`
  untouched, CI green on the head — and it was merged on that basis, with ratification asked for
  afterwards. Joel's correction: reject it and kick it back to the agent to ask him. The outcome was
  approval; the handling was still wrong, because code already written applies pressure to approve
  it and the brief ends up following the code. **Two rules came out of this**, both now in
  `CLAUDE.md`: ask before you build when a change contradicts something settled, and answer the
  second-order questions before a change is agreed.
- **2026-09-11 — The `/api/summary` flag was wrong, and it was the TD's error.** Raised as widening
  `INTERNAL_API_SECRET` across four apps, from reading design notes rather than the route. The
  carve-out is one exact path, mirrors the editor's `/api/draft` precedent, is read-only and fails
  closed. Recorded as mistaken rather than quietly dropped. **Verify from the code.**

## Known, deliberately not fixed

- **2026-09-11 — Every push rebuilds every Vercel project.** No Ignored Build Step. The change is
  written and agreed — one `ignoreCommand` line per app's `vercel.json`, in the Platform handoff —
  and not landed. Merging it is also the cleanest way to clear the deploy backlog.
- **2026-09-11 — DNS is wired two ways.** `editor` resolves through `vercel-dns-017.com`; the others
  use the legacy `76.76.21.21` A record. Both work. If switching, take each target from that
  project's own Domains tab — they are not interchangeable.
- **2026-09-11 — `/api/health` sits behind the password gate**, so no external monitor can reach it.
- **2026-09-11 — `editor.model_status` has zero rows.** The login-time drift check has never
  successfully written. Not diagnosed, and the oldest unexplained thing here.
- **2026-09-11 — The hub's mobile login bug.** Opening a tool from an embedded tile re-triggers that
  app's login on mobile. Reported on mobile Chrome, so the Safari/ITP explanation does not fit.
  Check what URL the iframe actually loads first.

## Read this before transferring the repo again

**A repo transfer breaks every running agent session, irreversibly for that session**, and it is
what broke deployments today.

- A session's authorized repository set is **fixed when the session starts**. When the repo moved,
  the running TD session lost `git fetch` and every GitHub API call and could not be repaired —
  `add_repo` refuses cross-owner additions.
- **GitHub App installations do not transfer with a repository.** Reconnecting the connector does
  not help: it re-authorizes an identity, it does not create an installation on an org that has
  none.
- **Vercel's app is subject to exactly the same thing**, which is this morning's lesson arriving
  again this evening as a three-hour deployment outage.

Before the next transfer: install Claude's **and** Vercel's GitHub Apps on `Tech-Paddock` first,
with "only select repositories" — the org already holds three unrelated repos. Then stop every
running session. Then move. In that order.

## Enforcement status

Rules in `CLAUDE.md` are written, not enforced. Only three things enforce:

1. **Branch protection** — the GitHub API now reports `main` as `protected: true`, checked
   2026-09-12. That supersedes the previous standing instruction to assume it is inert. No agent can
   read rulesets, so *which* checks are required is still unverifiable from a session — including
   whether `build (coffee)` is among them.
2. **CI** — five matrix jobs. Hardcoded; a sixth app is silently untested until added.
3. **Hooks** — three in `.claude/settings.json`, currently doing the real work. `SessionStart`
   prints this ledger into every session; two `PreToolUse` guards refuse a push to `main` and refuse
   `supabase migration repair`. They work regardless of GitHub plan.
