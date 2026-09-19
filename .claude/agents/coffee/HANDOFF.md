# Coffee — handoff

State as of 2026-09-19.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, installed to the iPhone home
screen and confirmed on a phone. The whole flow has run end to end against a real bag.

**Save comes before the search**, and the page polls the row rather than waiting: the search takes
minutes with nothing on the connection, so a phone calls it dead. Two answers were lost that way.

**The search is a comparison harness.** Model and effort are selectable and recorded; a weaker model
is safe because `validateGuide` enforces quote-backing in code. `lib/models.ts` is a registry: each
model/effort mismatch is a 400, not a degraded result.

**A bag is a purchase; a brew is one attempt at it.** `extraction_yield` is generated and ppm never
stored, both to stop one measurement being written twice. **Adding a field? Measurement, or function
of measurements?**

**The brew form works in dose, ratio and water, and any two give the third.** Changing the dose holds
the ratio and moves the water; typing water re-derives the ratio. **The ratio has no column** — it is
water over dose, derived in `lib/brews.ts` and dropped before the POST. `water_g` is *not*
`beverage_g`: water in, not what came out of the bed.

**A new brew opens as a repeat of the last one, then as the roaster's numbers.** Settings carry and
your last brew wins field by field; no reading carries at all. `openingBrew`.

**Beverage mass, TDS and the extraction read-out are commented out in the form**, not deleted;
uncommenting two blocks puts them back, columns and tests untouched.

**The bag pill carries "Beans ↗"** as a *sibling* of the expand toggle, never nested: an `<a>` inside
a `<button>` is invalid markup and browsers disagree about what a tap does. Keep them siblings.

**The guide tier is a three-state indicator** — green Found, amber Non-Specific, red No Recipe —
expanding to the roaster's quote. Wording is in `lib/guideDisplay.ts`, apart from `lib/guide.ts` so
presentation cannot reach validation. **The bag card is three sections**: This bag, Recipe, Brews,
with Save and Delete inline between the last two and the confirm replacing that row.

**The icon is a pour-over in the JPS livery**, every colour a `theme.css` token. **Its two gold rules
are structural:** a near-black tile loses its edge on a dark wallpaper. Source and re-render recipe
in `apps/coffee/design/`, kept out of `app/` where a folder is a route. The PNG has **no alpha**.

## Traps specific to this app

- **An empty result and an unread result must not render the same.** Three times in this one app a
  failure rendered as a plausible empty answer. **Adding a read path here? Check this first.**
- **The search step cannot be exercised from a Claude Code sandbox** — roaster domains are blocked by
  the egress proxy. Tests cover validation against recorded response shapes. **Do not conclude the
  feature works because the tests pass**; it has to be verified on a deploy preview with a real bag.
- **Two brewer vocabularies, and `myBrewerFor` crosses only on an exact match.** A bare "V60" does
  not map: two are on the shelf and the roaster did not say which. Rounding is the same invention.
- **An installed app has its own cookie jar**, so signing in inside it is expected, not a session bug.
- **The icon is a static import**, from `/_next/static` — the one prefix the middleware excludes.
  Next's `app/apple-icon.png` convention is gated; iOS would take a shot of the login page.
- **`guide_status` records where instructions were read, not who they were written for.** Sweet
  Bloom print the same recipe on every product page. Nothing should rank or filter on tier 1.

## In flight

`claude/coffee-bag-card-layout` — PR open, CI green on its head. The bag card rebuilt to Joel's
sketch: the tier is a three-state light, the card is three sections, Save and Delete share a row.
**Actions refused to start any job account-wide, on billing, for an hour of 2026-09-19.** Making the
repo public cleared it, and run 484 is this branch's first genuine green rather than a stale re-read.

**One item of that sketch is deliberately unbuilt**: generating a recipe when the roaster published
none. It contradicts `RULES.md` §1 and needs a schema decision, so it went to Joel.

## Next

1. **Run the same coffee twice — Haiku, then Sonnet 5 at `high`** — and compare which tier each
   reports. The open question the harness was built to answer, and nothing in the repo can answer it.
2. **Expect `normalizeMethod` to need alias tuning** once there are real guides: the regexes were
   written against how roasters *tend* to word things, not against a sample.
3. **Seeding roaster domains is proposed, not started.** No agent here can verify a domain.
4. The deliberately-unbuilt list — timer, inventory, method lookup table — stays unbuilt until asked.
