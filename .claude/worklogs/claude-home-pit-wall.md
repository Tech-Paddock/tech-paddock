# claude-home-pit-wall
agent: technical director · apps: home · shared files: none
authorized by: Joel, directly, in session — "I need to override your settings for the specific
instance… it needs to be designed at the highest level in your insight for that then you can build
it… I don't want this to live in any markdown single bypass only"

## 2026-09-15 — claim, and the override written down because it is not the norm

`apps/home` is TechPad Gen's, and an hour earlier I landed a rule making them owner of the theme in
every app. **Joel overrode that for this change specifically**, on the reasoning that passing design
and build between two agents costs more than it buys when one of them already holds the platform
view. Recorded here rather than left in a conversation, because TechPad Gen cannot see that
conversation and would otherwise find their app changed by someone else with no explanation.

**This is a single bypass, not a precedent.** The next change in `apps/home` is theirs.

## 2026-09-15 — what the repo already had, which changed the design

I was about to build a second data system. `lib/glance.ts` already had the pattern:

> *the hub holds no database credentials and talks to no schema — it asks each tool for its own
> roll-up and merges the answers.*

It already names sources that fail — `unavailable`, `degraded` — rather than rendering them as zero.
That is the "never claim more than the source supports" rule, implemented before I wrote it down. So
`lib/pitwall.ts` follows it deliberately: **an unreachable source appears with its reason and never
as an empty row**, because an empty board and a broken board must not look alike.

## 2026-09-15 — the three decisions worth keeping

**Ordered by who is blocked, never by recency.** `box` → `agent` → `clear`, and the sort key is the
state. An old blocker deserves more prominence than a new one, not less — which is the whole reason
this is not a feed.

**Every row carries its source, and the source is not optional in the type.** It is what lets a
reader tell whether "the migration is applied" came from the database or from a document that says
so. The five are `github`, `vercel`, `repo`, `worklog`, `supabase`.

**Two clocks, both shown.** Live sources are read per request; the repo half is baked at build time,
because `apps/home` is the Vercel Root Directory and files above it are not readable at runtime.
The header states both ages separately rather than implying one freshness. Once `GITHUB_TOKEN`
exists the same prose can be read live through the Contents API and the bake becomes the floor
instead of the ceiling.

**No new colour.** Every style paints through tokens already in `globals.css` — severity reads
through `--sev-urgent` and `--accent`, both already chosen against this ground. The theme is TechPad
Gen's even in a change they did not write, and that rule binds the TD too.

## 2026-09-15 — what it found on its first run, which is the point

The generator read the ledger and surfaced **three items still listed under *Waiting on Joel* that
were closed hours ago** — the resurrected branch, a pull request since merged, the history rewrite.
The board will keep showing them until the ledger is corrected. That is not a bug to hide: a wall fed
by a stale ledger displays a stale ledger, and seeing it is how the ledger gets fixed.

## 2026-09-15 — scope, honestly

**Built:** the agent strip, the board, filters across state and source and agent, the not-reported
panel, and both labels — `/` is **Pit Wall**, `/admin` is **The Garage**.

**Not built, and not faked:** the feed. It needs commit and event history from GitHub, which needs a
token that does not exist yet. A tab rendering placeholder events would have been worse than no tab.
**Telemetry is likewise absent and says so on the page** — it is listed under "not reported" with the
reason, so the missing half is visible rather than implied.

## 2026-09-15 — handoff
Landed on the branch, no pull request: `lib/pitwall.ts`, `app/PitWall.tsx`,
`scripts/collect-paddock.mjs` and its generated manifest, the wiring in `page.tsx` and `Landing.tsx`,
nav labels in `Chrome.tsx`, and pit wall styles appended to `globals.css`. `prebuild` now runs both
collectors. `npm run build` clean, `tsc --noEmit` clean.
Open: the feed, and phase two telemetry. Both are in `.claude/specs/pit-wall.md` on
`claude/home-pit-wall-spec`.
Need from TD: nothing, this is the TD.

**Deployment.** On merge Vercel rebuilds `tp-home` and the page is live — the board renders
immediately from baked repo rows. **What a human does, in order:** set `GITHUB_TOKEN` and
`VERCEL_TOKEN` on `tp-home`, then **redeploy**, because Vercel bakes the environment in at build time
and a dashboard change does not reach a running deployment. **Verify:** open `techpaddock.io`, confirm
the sidebar reads Pit Wall and The Garage, and that the "not reported" panel no longer names github
and vercel. **If the steps are skipped:** nothing breaks. The board runs on repo rows and names the
two missing sources with their reason, which is the designed degraded state rather than a failure.
