# Coffee — handoff

State as of 2026-09-18.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, installed to the iPhone home
screen and confirmed on a phone. The whole flow has run end to end against a real bag.

**Save comes before the search**, and the page polls the row rather than waiting on a response: the
search takes minutes with nothing on the connection, so a phone concludes the request is dead. Two
correct answers were lost that way on the first live run. Reasoning in `RULES.md`.

**The search is a comparison harness.** Model and effort are selectable and recorded on the bag; a
weaker model is safe because `validateGuide` enforces quote-backing in code, so it can only fail to
find one, never invent one. `lib/models.ts` is a registry: each model/effort mismatch is a 400.

**A bag is a purchase; a brew is one attempt at it.** One set of columns on the bag could only hold
the last thing you tried. `extraction_yield` is generated and ppm is never stored, both to stop one
measurement being written twice. **Adding a field? Measurement, or function of measurements?**

**The brew form works in dose, ratio and water, and any two give the third.** Changing the dose holds
the ratio and moves the water; typing water re-derives the ratio. **The ratio has no column** — it is
water over dose, derived in `lib/brews.ts` and dropped before the POST. `water_g` is *not*
`beverage_g`: water in, not what came out of the bed.

**A new brew opens as a repeat of the last one, then as the roaster's own numbers.** Settings carry —
brewer, method, grinder, grind setting, dose, water, ratio — and your last brew wins field by field:
their number is where your dial-in started, not an instruction. No reading carries. `openingBrew`.

**Beverage mass, TDS and the extraction read-out are commented out in the form**, not deleted. The
columns, the generated yield and their tests are untouched; uncommenting two blocks puts it back.

**The bag pill carries "Beans ↗"** as a *sibling* of the expand toggle, never nested: an `<a>` inside
a `<button>` is invalid markup and browsers disagree about what a tap does. Keep them siblings.

**The roaster's quote sits above the parsed recipe**, in both cards: the parse is a reading of it.

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
- **An installed app has its own cookie jar**, so signing in inside it is expected, not a session bug.
- **The icon is a static import**, served from `/_next/static` — the one prefix the middleware
  matcher excludes. Next's `app/apple-icon.png` convention is gated; iOS would take the login page.
- **`guide_status` records where instructions were read, not who they were written for.** Sweet
  Bloom's bag is tier 1 because 1:17 was read on its product page — and that is the recipe they print
  on every product page. Nothing should rank, filter or quote on the strength of tier 1.

## In flight

`claude/coffee-ratio-water-and-recipe-labels` — pushed, CI green, no PR yet. The ratio/water form,
roaster-seeded defaults, the commented-out TDS half, the brew log moved below the bag's Save button,
the quote above the parsed recipe, and **an additive migration adding `coffee.brews.water_g`**.

**One thing in it is unbuilt and waiting on Joel.** He asked the tier-1 heading to read "Bag
specific"; tiers 2 and 3 were renamed and tier 1 was not, because that label asserts the one thing
the tier does not check. One line the moment he answers.

## Next

1. **Run the same coffee twice — Haiku, then Sonnet 5 at `high`** — and compare which tier each
   reports. The open question the harness was built to answer, and nothing in the repo can answer it.
2. **Expect `normalizeMethod` to need alias tuning** once there are real guides. The vocabulary is
   right; the regexes were written against how roasters *tend* to word things, not against a sample.
3. **Seeding roaster domains is proposed, not started.** It needs its own table — `bags` rows are
   purchases, and **no agent in the sandbox can verify a domain**, which is the guess it refuses.
4. The deliberately-unbuilt list — timer, inventory, method lookup table — stays unbuilt until asked.
   **Parked with it:** the beans link's size, which Joel may want changed and has not said so.
