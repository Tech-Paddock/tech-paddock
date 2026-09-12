# Open items — technical director

Written down because sessions do not remember. This is read and reported at the start of every TD
session, before anything else. Every entry is dated, so if it goes stale that is visible rather
than hidden.

Agents: read this, do not edit it. If you need something on this list, say so in your own worklog.

**Last reviewed: 2026-09-12 18:40 UTC.**

Detail lives in the agent handoffs — `.claude/agents/<agent>/HANDOFF.md`. This file is the index
and the things that belong to nobody else.

---

## Blocking everything else

Nothing. The deploy outage is closed — see the first entry under "Done" below.

## Waiting on Joel

1. **2026-09-12 — Verify `SESSION_SECRET` parity. Rotated again at 01:39, live only after this
   push.** Rotating is the right move rather than churn: the existing values cannot be read back out
   of the dashboard, so parity cannot be confirmed by inspection — setting one fresh known value on
   all five is the only way to guarantee it.
   **A dashboard change does not reach a running deployment.** Vercel bakes the environment into the
   serverless function at deploy time, so reading `process.env` per request still reads the
   environment the deployment was built with. At 01:45 all five projects had settings changed at
   01:39-01:40 and a last deployment of 00:48:22 — fifty-one minutes earlier — so every app was
   still
   running the previous secret. **Do not test SSO before a redeploy; you would be testing the old
   value and learning nothing.**
   Once deployed: log in at `techpaddock.io`, then open a tool from a hub tile, on desktop and on
   mobile. A loop on both points at the secret; a loop on mobile only points at the iframe, which is
   the separate known bug. No agent can read the values — this one is Joel's eyes only.
2. **2026-09-12 — A sixth Vercel project called `tuning` exists. Did you create it?** Created
   18:02 UTC today, three minutes before a TechPad Gen preview, `framework: null`, one READY
   production deployment, Node 24.x. **It is not publicly exposed** — Vercel SSO covers all three
   `*.vercel.app` domains and no custom domain is attached, so it redirects to `sso-api` and carries
   `x-robots-tag: noindex`. Checked, because a project pointed at the repo root serving an unprotected
   page is an incident this project has already had. So it is contained, not urgent — but creating a
   project is on the never-without-the-TD list and I did not authorize it. If it is yours, say so and
   I will record it. If it is not, it should be deleted, and that is your click, not mine.
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

- **2026-09-12 — `middleware.ts` is three versions, not five copies, and the brief now says so.**
  Joel's call, delegated. The rule was always right; the reason printed under it was false, and a
  rule defended by a wrong fact is one somebody talks themselves past — TechPad Gen checked, found
  three, and correctly reported the brief as wrong.
  Re-verified by checksum before writing: `lib/auth.ts` and `lib/password.ts` **are** identical
  across all five. `middleware.ts` is three — `home`/`resume`/`coffee` share one, `editor` adds a
  scoped `/api/draft` bypass, `tracker` adds `/api/summary` plus an outright `/api/cron/*` wave-
  through.
  **The correction also names the real danger, which the old wording hid.** `middleware.ts` is not
  gated because the copies match; it is gated because it *is* the password gate. A bad edit there
  publishes an endpoint rather than breaking a login — and tracker already shows the shape, since
  `/api/cron/*` skips the gate and the route's own `if (secret && …)` fails **open** without
  `CRON_SECRET`. That trap was already on this ledger and the rule protecting it described the
  wrong hazard.
  Corrected in eleven places: `CLAUDE.md` twice — including a line I wrote myself an hour earlier in
  the Chrome note, which repeated the error I was about to correct — the TD charter, and the
  `RULES.md` and `KICKOFF.md` of all five app agents. **Every prohibition is unchanged**; only the
  justification moved. `message-editor` and `tracker` were the clearest proof it was wrong: each
  named its own carve-out and then called the file byte-identical in the next sentence.
  **One left for its owner.** `.claude/agents/coffee/HANDOFF.md` still says it. Handoffs are not the
  TD's to rewrite, so Coffee corrects that next time it touches the file.

- **2026-09-12 — `CLAUDE.md` now says Chrome is the default and Safari is a utility.** Joel asked
  for a browser note, then amended it the same hour once the consequence surfaced: **Chrome is the
  default, on desktop and phone; Safari is a utility browser, used only where Chrome cannot do the
  job.** Safari is still never the explanation for a bug — reports come from Chrome unless stated,
  and the mobile login bug already lost a round to an ITP theory about a browser that was not in the
  loop.
  Written as a diagnosis rule rather than a word ban, because a ban would have caused a bug: on iOS
  every browser is WebKit, Chrome included, so the `<img>` decode fallback in
  `apps/coffee/lib/image.ts` protects the phone Joel actually uses, and an agent told only "we use
  Chrome" would have deleted it as dead code.
  **This also settles #42.** Installing Coffee through Safari is the intended path, not a defect —
  iOS allows no other route to a standalone home-screen app. The rule says so explicitly, and says
  it is *not* grounds for adding a manifest to make apps Chrome-installable, because that means
  editing `middleware.ts` — the password gate, TechPad Gen's call.
  **Two stale references left for their owners.** `.claude/agents/techpad-gen/HANDOFF.md` still
  carries the Safari/ITP theory for the mobile bug — that file is the open conflict in #43 and is
  theirs to rewrite. `apps/coffee/app/globals.css` has a comment reading "In Safari these insets are
  zero", which is true of any browser tab and should say so; Coffee's to fix, cosmetic, not urgent.
- **2026-09-12 — #42 merged: Coffee installs on the iPhone home screen.** `apple-touch-icon` and
  the `apple-mobile-web-app-*` tags, safe-area insets, a favicon. Deliberately iOS-only: a manifest
  is fetched without credentials, so the gate returns the login redirect and the install silently
  never offers itself, and letting it through means editing `middleware.ts` — the password gate, not
  Coffee's to change. The icon is a static import so it serves from `/_next/static`, the one prefix
  the matcher excludes; Next's own `app/apple-icon.png` convention sits behind the gate, where iOS
  falls back to a screenshot of the login page as the icon. Verified at the gate: matcher confirmed,
  `middleware.ts` untouched, both binaries scanned for metadata and clean, all five matrix jobs
  green. **It also carried the handoff rewrite #41 asked for** — the new rule working in the
  direction it was meant to, one pull request after it landed.
- **2026-09-12 — #43 sent back, and the handoff rule is why.** TechPad Gen's hub re-theme and
  `/admin` page: good work on a base that was never brought current. Conflict in its own handoff,
  CI never ran at all (GitHub cannot build a merge ref while a PR conflicts), and both the handoff
  and the body assert production serves `92c1ec1` when `tp-home` has served `f06ff0c` since 03:57.
  Not backfilled by me, deliberately — the conflict is inside the handoff, so fixing it would mean
  writing it. Detail in `.claude/agents/td/HANDOFF.md`.

- **2026-09-12 — Handoffs are now part of the gate, and #40 is why.** Agents update their
  `HANDOFF.md` when they open or change a pull request; the TD reads every handoff a change touches
  before merging, and a stale one sends the change back rather than getting backfilled on the way
  past. #40 moved Coffee's save ahead of its search — the app's central flow — and updated the
  charter and the worklog and no handoff, so the merge published a document that was confidently
  wrong about the one thing it exists to explain. Coffee's handoff now carries a staleness banner
  and its rewrite is the Coffee agent's first task; the TD did not write it, because a handoff
  written by the TD is a second-hand reading of someone else's work.
- **2026-09-12 — #39 and #40 merged.** Bag lookups no longer report success when the database is
  unreachable — a swallowed Supabase `error` made an unreachable database look like a first-time
  coffee, and two of three call sites answered 200 with a confident wrong answer. And the
  brew-guide search is backgrounded, with a selectable model and effort recorded per bag. #40's
  migration was applied to the hosted project immediately before the merge — additive columns, so
  the running code ignored them and there was no window where new code met old schema.

- **2026-09-12 — COFFEE IS FULLY UP.** `GET /api/health` returns `{"ok":true}`: `coffee schema
  reachable`, `bucket coffee-files reachable`, `ANTHROPIC_API_KEY` set. It is deployed at
  `coffee.techpaddock.io`, behind the password gate, on current `main`.
  **Three separate failures, in three different systems, and only one was where it looked.** The
  `SUPABASE_SERVICE_ROLE_KEY` held a non-JWT value — Supabase's value in a Vercel field, diagnosed
  from `Invalid Compact JWS`, which is Storage failing to parse it as a JWT. `ANTHROPIC_API_KEY` was
  simply blank. And the last one was neither: **the `coffee` schema was never added to the hosted
  project's exposed schemas**, so PostgREST refused it with `Invalid schema: coffee` while the grants
  were perfect all along. Fixed in the Supabase dashboard with no code, no migration and no redeploy.
  **`supabase/README.md` was wrong about this and is corrected.** It said adding a schema means two
  migrations plus `config.toml` — but `config.toml` configures only the local stack, and `coffee` was
  already listed there while the hosted project still refused it. Three steps, not two.

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

- **2026-09-12 — Every push still rebuilds every Vercel project, including `tp-coffee-app`.**
  `tp-coffee-app` has *Skip deployments when there are no changes to the root directory or its
  dependencies* **enabled**, and it still rebuilt twice from #35 — a commit touching only `.claude/`,
  nothing under `apps/coffee`. **So the toggle does not behave as its label suggests, at least not
  here, and a previous version of this entry asserted the opposite. Do not plan around it.** Why it
  did not skip is not understood; the plausible readings are that it does not apply to the first
  build after a Root Directory change, or that "dependencies" is broader than it sounds. Establish
  the behaviour before relying on it either way.
  That leaves the `ignoreCommand` change in the Platform handoff still unlanded and still arguably
  wanted — a docs-only commit currently triggers five full Next.js builds.
- **2026-09-12 — DNS is now uniform, and that entry is retired.** All four subdomains — `editor`,
  `tracker`, `resume`, `coffee` — are CNAMEs to `d1317e1174061c29.vercel-dns-017.com`, changed by Joel
  at 01:39 and verified resolving. The apex `techpaddock.io` stays an A record at `76.76.21.21`
  because an apex cannot be a CNAME; that is correct rather than a leftover. All four app domains
  still return 200 and still send `frame-ancestors 'self' https://techpaddock.io
  https://*.techpaddock.io`, so the embed restriction survived the switch.
- **2026-09-11 — `/api/health` sits behind the password gate**, so no external monitor can reach it.
- **2026-09-11 — `editor.model_status` has zero rows.** The login-time drift check has never
  successfully written. Not diagnosed, and the oldest unexplained thing here.
- **2026-09-11 — The hub's mobile login bug.** Opening a tool from an embedded tile re-triggers that
  app's login on mobile. **Reported on Chrome, which is the only browser used here** — so a
  cookie-partitioning explanation borrowed from another engine is not the diagnosis, and reaching for
  one cost a round already. Check what URL the iframe actually loads first; that is still unchecked.
  `CLAUDE.md` now says this once, under the shared foundation, so it stops being re-litigated.

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
