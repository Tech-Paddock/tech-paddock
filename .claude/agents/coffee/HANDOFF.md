# Coffee — handoff

State as of 2026-09-12, 15:10 UTC.

Read `RULES.md` first. This file is only what is true right now.

---

## It is live, and the whole flow has run

`coffee.techpaddock.io` serves the app behind the password gate. `GET /api/health` returned
`{"ok":true}` at 03:00 — `coffee` schema reachable, `coffee-files` bucket reachable,
`ANTHROPIC_API_KEY` set. All five environment variables are right.

The flow has been exercised end to end against a real bag: `POST /api/identify` 200,
`POST /api/search` 200. The three-tier retrieval has run against a live roaster site. What has
**not** happened is a comparison worth reading — see "What to do next".

## The flow, as the code now has it

**Save comes before the search.** Confirm the label → the bag row is written → the search runs
against that row and updates it → the page polls the row. `guide_status` stays `not_searched` while
it is in flight.

This is the opposite of the original order and it is deliberate. The search reads real roaster pages
and takes thirty seconds to a few minutes with nothing travelling on the connection, so a phone
concludes the request is dead. That happened on the first live run: two searches returned 200 and
the browser showed "load failed" both times. The answer was correct and unreachable. Now it lands in
a row rather than in a response, so a dropped connection costs nothing and the tab can be closed
mid-search.

## The search is a comparison harness

The model and its effort are selectable per search and recorded on the bag — `guide_model` and
`guide_effort`. Default is **Haiku 4.5**.

Haiku is a safe default for a specific reason, and it is the reason to trust the whole idea:
`validateGuide` enforces quote-backing **in code**, so a weaker model cannot invent a recipe. It can
only fail to find one and report `none`. Going cheap costs recall, never a wrong recipe you would
brew.

The three models do not take the same request, which is why `lib/models.ts` is a registry rather
than a list of names: the dynamic-filtering web tools need Sonnet 4.6 or better, Haiku 4.5 rejects
`output_config.effort` outright, and `xhigh` exists on Sonnet 5 but not Sonnet 4.6. Every one of
those is a 400 rather than a degraded result. The route refuses a level the chosen model cannot
take rather than dropping it — a silently ignored setting would report a comparison that never ran.

## Columns added since #23

`guide_search_started_at`, `guide_search_error`, `guide_model`, `guide_effort`, `guide_dropped`.
All five are live in Postgres, verified directly. `guide_dropped` is not bookkeeping: dropped
values used to live only in the search response, and backgrounding would have discarded them
silently — which is the thing `RULES.md` says they exist to prevent.

## Failures are legible now

`findPreviousBag` and `findRoasterDomain` used to destructure only `data` and throw the error away.
Both answer `null` legitimately, so an unreachable database was indistinguishable from "no previous
purchase" and "no verified domain yet" — and an hour of debugging went to the Anthropic key because
two call sites reported success while only the library list told the truth. Both now throw
`LookupError` carrying the Postgres message.

**The trap that caused it is not in this app's code and will hit the next new schema too:** `coffee`
had a correct migration, correct grants, and was listed in `config.toml`, and PostgREST still
answered `Invalid schema: coffee`, because the hosted project's **exposed schemas** list is a
dashboard setting that lives nowhere in this repo. `supabase/README.md` documents it as step three
of three.

## Two brewer vocabularies

`guide_method` records what the roaster published and stays broad; the list in `lib/brewers.ts`
names what is on the shelf. They were one list until the first real bags arrived and every one was
Sweet Bloom publishing "ORIGAMI AIR" — unplaceable against any five-item list, and correctly
recorded as "other" rather than guessed at as a V60. Origami is in the roaster's vocabulary now.

`myBrewerFor` crosses between them only on an exact match. A bare "V60" does not map, because two
of them are on the shelf and the roaster did not say which.

## The page, and deleting a bag

One page, not two tabs: the shelf is the page and scanning is a collapsible section above it.
"Shelf" is what the library is called — every bag is on it, not a subset. Splitting finished bags
from open ones was scoped and parked; it would be one nullable `finished_at` and a filter, and the
column is deliberately absent until that is wanted.

`DELETE /api/bags/[id]` removes the row and then its photo, in that order. The save path writes the
file before the row that points at it, so deleting in the same order means a row never references
an object that is gone. A leftover object is the lesser failure and the delete is best-effort about
it. Deleting an id that matches no row is a 404, not a success.

## The shape of the data

`coffee.bags` 1 ──< `coffee.brews`. A bag is a purchase and what the roaster published; a brew is
one attempt at it. The dial-in — brewer, brew method, grinder, grind setting — moved off the bag
entirely, because one set of columns can only hold the last thing you tried.

Two things on `coffee.brews` are deliberately not writable and should stay that way:
`extraction_yield` is a generated column, and ppm is never stored at all. Both exist to stop one
measurement being recorded twice in forms that can disagree. If you add a field here, ask first
whether it is a measurement or a function of measurements.

`findPreviousBag` reads the most recent brew of the previous bag, not columns on the bag.

## In flight

**Library load failures are now visible (branch `claude/coffee-surface-library-errors`).** The
library tab rendered "No bags yet. Scan one." whenever `GET /api/bags` failed, because the loader
only assigned on `res.ok` and silently kept an empty list — a confident statement about data it had
never read. Joel hit it with two bags saved. It also fixes the cause: a search term went into a
PostgREST `or=(...)` filter unquoted, so a comma in "Sweet Bloom, Colombia" started a new filter
term rather than being searched for, and returned a 500.

**This is the same defect three times in one app** — `findPreviousBag`, `findRoasterDomain`, and now
the library loader all turned a failure into a plausible empty answer. If you are adding a read
path here, that is the thing to check first: an empty result and an unread result must not render
the same.

**#42 — installable on the iPhone home screen.** Add to Home Screen in Safari gives it an icon,
full screen and no browser chrome. An installed iOS app has **its own cookie jar**, so signing in
once inside it is expected rather than a session bug, and it is reached directly rather than
through the hub's iframe. iOS only, on purpose: a web app manifest is
fetched without credentials, so the password gate returns the login redirect and the install
silently never offers itself. Allowing it through means editing `middleware.ts`, which is
byte-identical in five apps and not Coffee's. If every tool should be installable, that pattern is
TechPad Gen's.

## What to do next

1. **Run the same coffee twice — Haiku, then Sonnet 5 at `high`** — and compare which tier each
   reports. That is the open question the harness was built to answer and nothing in the repo can
   answer it. `guide_model` and `guide_effort` are on the row so the comparison stays readable
   afterwards.
2. **Expect `normalizeMethod` to need alias tuning** once there are real guides to look at. The
   vocabulary is right; the regexes were written against how roasters *tend* to word things, not
   against a sample.
3. **Seeding roaster domains is proposed and not started.** It would let the first search for a
   known roaster pin `allowed_domains` instead of running unpinned. It needs its own table — `bags`
   rows are purchases and phantom rows would break that — and the domains must be verified through
   the deployed app, where `web_fetch` has real egress. **No agent in the sandbox can verify one:**
   roaster domains are blocked by the egress proxy, so a list produced here would be recalled from
   training, which is the exact guess `findRoasterDomain` refuses.
4. Nothing else is queued. The deliberately-unbuilt list — brew log, timer, inventory, method lookup
   table — stays unbuilt until asked for.
