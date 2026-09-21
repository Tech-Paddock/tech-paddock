# Coffee — handoff

State as of 2026-09-21. Read `RULES.md` first; this file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, installed to the iPhone home
screen. The whole flow has run end to end against a real bag.

**Save comes before the search**, and the page polls the row rather than waiting: the search takes
minutes with nothing on the connection, so a phone calls it dead. Two answers were lost that way.
**It can be run again from the shelf** — same call, same polling, and it refreshes the link too.

**A `none` is no longer the end of the screen.** Sonnet 5 suggests a recipe where the roaster
published none, into `suggested_recipe`, **never `guide_*`**, with no quote and no URL because it
read nothing. The light still says **No Recipe Found**. `RULES.md` §1 has the amendment; the risk it
names is wording, so the copy is under test.

**The search is a comparison harness.** Model and effort are selectable, recorded and validated by
`lib/models.ts`; a weaker one is safe because `validateGuide` enforces quote-backing in code. **Neither
the suggestion nor Search again is on that dial.**

**A bag is a purchase; a brew is one attempt at it.** `extraction_yield` is generated and ppm never
stored, to stop one measurement being written twice. **Measurement, or a function of them?** **The
brew form works in dose, ratio and water, and any two give the third**, and **the ratio has no
column** — water over dose, derived in `lib/brews.ts`, dropped before the POST, and rounded whole
since 2026-09-20. `water_g` is *not* `beverage_g`: water in, not what came out. **The refractometer
half of the form is commented out**, not deleted. **Brew time is a real field**, whole seconds in
`brew_seconds`, typed as `m:ss` — **a reading**: it neither repeats nor prefills from `guide_time`,
and a bare "3" is refused rather than guessed at. **No timer, confirmed** — Joel, 2026-09-21: "just
a text field for brew time." Not a gap to close; the text field is the design.

**A new brew opens as a repeat of the last one, then as the roaster's numbers** — `openingBrew`, your
last brew winning field by field, no reading carried. **A suggestion does not feed it, settled**: you
read it and type it, and typing it is where you decide to use it.

**Roast date is a real date field** beside Purchased on one row — the gap is the age of the coffee.
The label's date goes through `lib/dates.ts`; an ambiguous `05/06/2026` is refused and shown as text.
**A date input on iOS sets its own minimum width**, so `globals.css` turns that off — without it the
second of two on a row runs past the card. **The guide tier is a three-state indicator** — green
Found, amber Non-Specific, red No Recipe — a quiet grey italic line since 2026-09-20, expanding to
the quote. **The card is three sections**: This bag, Recipe, Brews. **A brew pill shows nothing
about the grinder**, name or dial setting — Joel closed that judgement call on 2026-09-21. Rating
leads, water is unlabeled in the recipe, brew time sits inline behind a vertical rule.
`formatGrindSetting` still runs at save; the setting is logged, just not shown on the pill.

## Traps specific to this app

- **An empty result and an unread result must not render the same.** Four times in this one app a
  failure rendered as a plausible empty answer. **Adding a read path here? Check this first.**
- **A bag needs a purchase date, and the error names it.** That empty field sent `{}` and the page
  said "Couldn't save that bag" about a bag saved minutes earlier. `lib/patch.ts` holds both
  halves: the requirement, and sending only what moved.
- **Neither model call can be exercised from a Claude Code sandbox** — roaster domains are blocked
  by the egress proxy and the suggestion needs a real key. Tests cover the validation and the
  coercion against recorded shapes. **Do not conclude either works because the tests pass.**
- **Two brewer vocabularies, and `myBrewerFor` crosses only on an exact match.** A bare "V60" does
  not map: two are on the shelf and the roaster did not say which. Rounding is the same invention.
- **The icon is a pour-over in the JPS livery**, every colour a token, **no alpha**, its two gold
  rules structural. **A static import**, from `/_next/static` — the one prefix middleware excludes.
- **"Beans ↗" is a *sibling* of the expand toggle, never nested** — an `<a>` in a `<button>` is invalid
  markup and browsers disagree about what a tap does.
- **`guide_status` records where instructions were read, not who they were written for** — Sweet
  Bloom print the same recipe on every page, so nothing should rank or filter on tier 1.

## In flight

**#161 merged 2026-09-20 15:06 UTC** — `coffee_brews_time` confirmed live on the database, read
directly rather than trusted from the PR body. `claude/coffee-pill-no-grind` is my only open branch,
carrying only the grind-setting removal above; no migration. **`claude/coffee-roast-date-and-suggested-recipe`
is still on the remote and should not be**, measured 2026-09-21: merged history, clutter, Joel's to remove.

## Next

1. **Run one coffee twice, Haiku then Sonnet 5 at `high`**, compare the tiers — the open question.
   The suggestion has still never run against a real bag.
2. **A timer is declined, not just unbuilt** — see above. Inventory and a method table stay
   unbuilt until asked.
