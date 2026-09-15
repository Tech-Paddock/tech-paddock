# claude-home-pit-wall-spec
agent: technical director · apps: none · shared files: none (new `.claude/specs/`)
authorized by: Joel, directly, in session — "Build your end. I can pick up any manual lifts
tomorrow", after agreeing the design: "I like your suggestion", plus source tags and filters

## 2026-09-15 03:30 — claim
Working on: the Pit Wall spec — the design and data contract agreed tonight, written down for
TechPad Gen to build against.
Touching: `.claude/specs/pit-wall.md` and `.claude/specs/README.md`, both new.
Depends on: nothing. **No app code**, no schema, no environment variable, no other agent's charter.

## 2026-09-15 03:30 — why this is a spec and not a page

Joel said build my end. **My end is the design and the data contract; the page is `apps/home`, which
is TechPad Gen's** — and I wrote a rule an hour ago reinforcing that they own how apps look. Building
their page while they are not running would have contradicted it on the same night it landed.

The exception I took earlier tonight was `apps/tracker`, and it had a reason this does not: live
personal data, which `CLAUDE.md` gates to the TD explicitly. "Joel is asleep" is not that reason.

## 2026-09-15 03:30 — the decisions the spec records, and the ones it refuses to make

**Agreed with Joel:** the board ordered by who is blocked rather than by data type; the agent strip
across the top; the feed behind a tab because recency is a poor proxy for urgency; a source tag on
every row; filters across state, agent and source; worklogs stay prose; deployment errors only.

**Three rules in it are mine and are the load-bearing part**, because they are what stop the page
becoming the thing this project keeps building by accident — a document that is confidently wrong:

- Never claim more than the source supports. `/admin` already holds this line and says so in its own
  header; the pit wall inherits it rather than inventing a softer version.
- Say how old the data is, always, and never present cached data as live. A refresh button that
  returns a cache is a lie with a spinner on it.
- Read-only, and **architecturally so**. The repo is the only channel between agents, so anything
  captured on the wall that an agent needs would have to reach the repo. That means a commit path
  from a web app — far larger than it looks, and a second source of truth on arrival.

**Refused to decide three things** and handed them back, because they are theme or layout and the
theme is now theirs: whether the strip renders blank or hides before phase two; whether the board
replaces the app tiles or sits above them; and the severity treatment, since the red wash on `BOX`
rows is a new token and that is TechPad Gen's call by the rule that landed tonight.

**Phase two stays sketched rather than specified.** The telemetry table is the interesting half and
the tempting one to design now, but the honest note is in the spec: if the board is not useful
without it, telemetry will not save it. What the spec does pin down is the rule that keeps the table
from rotting — it holds telemetry, never record — and the three ways an agent might write to it,
including the one to avoid, because a hub API route needs a `middleware.ts` carve-out and that is the
shape that already fails open in tracker.

**One thing recorded as unknown rather than assumed:** whether agents can reach Supabase at all.
There is no `.mcp.json` in the repo, so access is account-level and they probably have what I have.
*Probably* is what this project keeps paying for, so the spec says confirm it.

## 2026-09-15 03:30 — a new folder, flagged rather than slipped in

`.claude/specs/` did not exist. Charters say what an agent owns and handoffs say what state an area
is in; neither is the place for a thing that does not exist yet. Its README says what a spec is, that
it dies when the thing is built, and that it is an opening position to argue with rather than an
instruction — the same rule as everywhere else here.

If Joel would rather this lived somewhere else, it is one `git mv` and nothing references it yet.

## 2026-09-15 03:30 — handoff
Landed on the branch, no pull request: `.claude/specs/pit-wall.md` and `.claude/specs/README.md`.
Open: the build itself, which is TechPad Gen's, and two environment variables that are Joel's —
`GITHUB_TOKEN` and `VERCEL_TOKEN` on `tp-home`, with a redeploy after, since Vercel bakes the
environment in at build time.
Need from TD: nothing, this is the TD.

**Deployment: nothing, and it deploys itself on merge.** Documentation only — no app folder, no
schema, no environment variable, no dashboard setting. Under per-app CI scoping this builds no app.
Verify by reading `.claude/specs/pit-wall.md` on `main`; there is no runtime surface. Nothing breaks
if it is never merged, beyond the design living only in a conversation that will be compacted.
