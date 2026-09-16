# Coffee — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, on current `main`.
`GET /api/health` returns ok on all three checks. The whole flow has run end to end against a real
bag: identify 200, search 200, three-tier retrieval against a live roaster site. `npm test` is green.

**Save comes before the search**, and the page polls the row rather than waiting on a response. The
search takes minutes with nothing travelling on the connection, so a phone concludes the request is
dead — two correct answers were unreachable that way on the first live run. Reasoning in `RULES.md`.

**The search is a comparison harness.** Model and effort are selectable and recorded as
`guide_model` and `guide_effort`; the Haiku 4.5 default is safe because `validateGuide` enforces
quote-backing in code, so a weaker model can only fail to find a recipe, never invent one.
`lib/models.ts` is a registry because the three models do not take the same request and each
mismatch is a 400 rather than a degraded result — the route refuses a level the chosen model cannot
take rather than dropping it.

**A bag is a purchase; a brew is one attempt at it.** The dial-in moved off the bag entirely, because
one set of columns can only hold the last thing you tried. `extraction_yield` is a generated column
and ppm is never stored — both exist to stop one measurement being recorded twice in forms that can
disagree. If you add a field, ask first whether it is a measurement or a function of measurements.

**A new brew opens as a repeat of the last one on that bag.** Settings carry — brewer, brew method,
grinder, grind setting, dose. Readings do not: beverage mass, TDS, rating and notes start empty, and
Clear empties the whole form. `repeatOf` in `lib/brews.ts`; the reasoning is in `RULES.md`.

**`guide_status` records where the instructions were read, not who they were written for.** The one
bag in the database is the proof: Sweet Bloom's Jhonny Alvarado is `coffee_specific` because 1:17,
900µm and 2:40 were read on the product page — and that is the recipe they print on every product
page. The label now says where it came from instead of claiming it was written for the coffee.

## Traps specific to this app

- **An empty result and an unread result must not render the same.** Three times in this one app —
  `findPreviousBag`, `findRoasterDomain`, the library loader — a failure rendered as a plausible
  empty answer. Both lookups now throw `LookupError`. **Adding a read path here? Check this first.**
- **The search step cannot be exercised from a Claude Code sandbox** — roaster domains are blocked by
  the egress proxy. Tests cover validation against recorded response shapes. **Do not conclude the
  feature works because the tests pass**; it has to be verified on a deploy preview with a real bag.
- **Two brewer vocabularies, and `myBrewerFor` crosses only on an exact match.** A bare "V60" does
  not map: two are on the shelf and the roaster did not say which. Rounding to the nearest one, on
  the roaster's authority, is the invention this tool refuses about brewing parameters.
- **The icon is a static import**, served from `/_next/static` — the one prefix the middleware
  matcher excludes. Next's `app/apple-icon.png` convention is gated; iOS would take the login page.
- **An installed app has its own cookie jar**, so signing in inside it is expected rather than a
  session bug. It is reached directly, not through the hub's iframe.
- **A tier-1 guide is not proof of a per-lot recipe.** Nothing should rank, filter or quote on the
  strength of `coffee_specific`. The one honest signal is cross-bag and is deliberately not built.

## In flight

**`claude/coffee-bean-link-and-optional-rating` — pushed, no pull request; Joel has not asked.**
"The beans" links out from the top of the bag card instead of a footnote at the bottom, and the
rating says it is optional — which it always was. **Deployment: nothing, it deploys itself on merge.**

**Needs the technical director: delete the remote branch `claude/coffee-repeat-the-last-brew`.** Same
work, pushed onto pre-rewrite history by mistake, so that ref keeps the scrubbed tracker names
reachable. Force-push and branch deletion are both blocked for me.

## Next

1. **Run the same coffee twice — Haiku, then Sonnet 5 at `high`** — and compare which tier each
   reports. The open question the harness was built to answer, and nothing in the repo can answer it.
2. **Expect `normalizeMethod` to need alias tuning** once there are real guides. The vocabulary is
   right; the regexes were written against how roasters *tend* to word things, not against a sample.
3. **Seeding roaster domains is proposed, not started.** It needs its own table — `bags` rows are
   purchases. **No agent in the sandbox can verify a domain**, so a list produced here is recalled
   from training, the exact guess `findRoasterDomain` refuses. It has to come from the deployed app.
4. The deliberately-unbuilt list — timer, inventory, method lookup table — stays unbuilt until asked.

Waiting on Joel: whether the iOS install works on a real iPhone — the meta tags and insets are
verified against the built HTML, the icon needs a phone. In the ledger.
