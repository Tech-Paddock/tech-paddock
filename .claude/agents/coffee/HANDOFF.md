# Coffee — handoff

State as of 2026-09-20. Read `RULES.md` first; this file is only what is true right now.

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
half of the form is commented out**, not deleted.

**Brew time is a real field**, whole seconds in `brew_seconds`, typed as `m:ss`. **It is a reading**:
it neither repeats nor prefills from `guide_time`, and a bare "3" is refused rather than guessed at.

**A new brew opens as a repeat of the last one, then as the roaster's numbers** — `openingBrew`, your
last brew winning field by field, no reading carried. **A suggestion does not feed it, settled**:
you read it and type it, and typing it is where you decide to use it.

**Roast date is a real date field** beside Purchased on one row — the gap is the age of the coffee.
The label's date goes through `lib/dates.ts`; an ambiguous `05/06/2026` is refused and shown as text.
**A date input on iOS sets its own minimum width**, so `globals.css` turns that off; without it the
second of two on a row runs past the card.

**The guide tier is a three-state indicator** — green Found, amber Non-Specific, red No Recipe — a
quiet grey italic line since 2026-09-20, expanding to the quote. **The card is three sections**: This
bag, Recipe, Brews. **A brew pill leads with its rating** and carries no grinder.

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
- **"Beans ↗" is a *sibling* of the expand toggle, never nested.** An `<a>` inside a `<button>` is
  invalid markup and browsers disagree about what a tap does.
- **`guide_status` records where instructions were read, not who they were written for.** Sweet Bloom
  print the same recipe on every page, so nothing should rank or filter on tier 1.

## In flight

`claude/coffee-recipe-and-brew-pill`, **open as #161**, is my only branch: Search again, brew time,
whole numbers, the date-box fix, the quiet tier line, the reshaped pill, and the `coffee_brews_time`
migration — additive, one nullable column, the gate's to apply before merging. **`claude/coffee-roast-date-and-suggested-recipe` is still on the
remote and should not be**, measured today: merged history, clutter, Joel's to remove.

## Next

1. **Only `coffee_brews_time` is waiting.** Read off the database 2026-09-20: `suggested_recipe` is
   live, `brew_seconds` is not. **The hosted API stamps its own version, so a filename is not what
   ran** — ledger 26 holds the numbers. **The suggestion has still never run against a real bag.**
2. **Run one coffee twice, Haiku then Sonnet 5 at `high`**, and compare the tiers. The open question.
3. The deliberately-unbuilt list — timer, inventory, method table — stays unbuilt until asked.
