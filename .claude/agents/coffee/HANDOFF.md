# Coffee — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, on current `main`.
`GET /api/health` returns ok on all three checks. The whole flow has run end to end against a real
bag: identify 200, search 200, three-tier retrieval against a live roaster site. **56 tests pass.**

**Save comes before the search, and that is deliberate.** Confirm the label → the bag row is written
→ the search runs against that row and updates it → the page polls the row. The search reads real
roaster pages and takes thirty seconds to a few minutes with nothing travelling on the connection,
so a phone concludes the request is dead — that happened on the first live run, twice, and the
answer was correct and unreachable both times. Now it lands in a row rather than in a response, so a
dropped connection costs nothing and the tab can be closed mid-search.

**The search is a comparison harness.** Model and effort are selectable per search and recorded on
the bag as `guide_model` and `guide_effort`. Default is Haiku 4.5, and that is safe for a specific
reason: `validateGuide` enforces quote-backing **in code**, so a weaker model cannot invent a recipe
— it can only fail to find one and report `none`. Going cheap costs recall, never a wrong recipe you
would brew.

`lib/models.ts` is a registry rather than a list of names because the three models do not take the
same request: the dynamic-filtering web tools need Sonnet 4.6 or better, Haiku 4.5 rejects
`output_config.effort` outright, and `xhigh` exists on Sonnet 5 but not Sonnet 4.6. Each is a 400,
not a degraded result. The route **refuses** a level the chosen model cannot take rather than
dropping it — a silently ignored setting would report a comparison that never ran.

**A bag is a purchase; a brew is one attempt at it.** The dial-in moved off the bag entirely, because
one set of columns can only hold the last thing you tried. `extraction_yield` is a generated column
and ppm is never stored — both exist to stop one measurement being recorded twice in forms that can
disagree. If you add a field, ask first whether it is a measurement or a function of measurements.

## Traps specific to this app

- **An empty result and an unread result must not render the same.** This same defect appeared three
  times in this one app — `findPreviousBag`, `findRoasterDomain`, and the library loader all turned
  a failure into a plausible empty answer. Both lookups now throw `LookupError` carrying the
  Postgres message. **If you are adding a read path here, check this first.**
- **The search step cannot be exercised from a Claude Code sandbox** — roaster domains are blocked by
  the egress proxy. Tests cover validation against recorded response shapes. **Do not conclude the
  feature works because the tests pass**; it has to be verified on a deploy preview with a real bag.
- **Two brewer vocabularies, and `myBrewerFor` crosses only on an exact match.** A bare "V60" does
  not map, because two are on the shelf and the roaster did not say which. Rounding to the nearest
  thing on the shelf, on the roaster's authority, is the same species of invention this tool refuses
  about brewing parameters.
- **The icon is a static import** so it is served from `/_next/static`, the one prefix the middleware
  matcher excludes. Next's own `app/apple-icon.png` convention is served from a gated route, and iOS
  would take a screenshot of the login page as the home screen icon instead.
- **An installed app has its own cookie jar**, so signing in inside it is expected rather than a
  session bug. It is reached directly, not through the hub's iframe.

## In flight

Nothing.

## Next

1. **Run the same coffee twice — Haiku, then Sonnet 5 at `high`** — and compare which tier each
   reports. That is the open question the harness was built to answer and nothing in the repo can
   answer it.
2. **Expect `normalizeMethod` to need alias tuning** once there are real guides to look at. The
   vocabulary is right; the regexes were written against how roasters *tend* to word things, not
   against a sample.
3. **Seeding roaster domains is proposed, not started.** It needs its own table — `bags` rows are
   purchases and phantom rows would break that. **No agent in the sandbox can verify a domain**, so
   a list produced here would be recalled from training, which is the exact guess
   `findRoasterDomain` refuses. It has to come from the deployed app.
4. The deliberately-unbuilt list — timer, inventory, method lookup table — stays unbuilt until asked.

Waiting on Joel: whether the iOS install works on a real iPhone. The meta tags and insets are
verified against the built HTML; whether iOS takes the icon needs a phone. It is in the ledger.
