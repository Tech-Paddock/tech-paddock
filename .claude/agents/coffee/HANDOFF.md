# Coffee — handoff

State as of 2026-09-19.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, installed to the iPhone home
screen and confirmed on a phone. The whole flow has run end to end against a real bag.

**Save comes before the search**, and the page polls the row rather than waiting: the search takes
minutes with nothing on the connection, so a phone calls it dead. Two answers were lost that way.

**A `none` is no longer the end of the screen.** Joel asked on 2026-09-19 for Sonnet 5 to suggest a
recipe when the roaster published nothing. It lands in `suggested_recipe`, **never `guide_*`**, with
no quote and no URL because it read nothing — no web tools on that call. The light still says **No
Recipe Found**, which is still true. `RULES.md` §1 carries the amendment; the risk it names is
wording, so the copy lives in `guideDisplay.ts` under test.

**The search is a comparison harness.** Model and effort are selectable and recorded; a weaker model
is safe because `validateGuide` enforces quote-backing in code. `lib/models.ts` is a registry: each
model/effort mismatch is a 400. The suggestion is **not** on that dial — nothing for it to retrieve.

**A bag is a purchase; a brew is one attempt at it.** `extraction_yield` is generated and ppm never
stored, both to stop one measurement being written twice. **Measurement, or function of them?**

**The brew form works in dose, ratio and water, and any two give the third.** **The ratio has no
column** — water over dose, derived in `lib/brews.ts` and dropped before the POST. `water_g` is *not*
`beverage_g`: water in, not what came out of the bed.

**A new brew opens as a repeat of the last one, then as the roaster's numbers** — `openingBrew`, your
last brew winning field by field, no reading carried. **A suggestion does not feed it, settled** —
Joel, 2026-09-19. You read it and type it, and typing it is where you decide to use it.

**Beverage mass, TDS and extraction are commented out in the form**, not deleted — uncomment to restore.

**Roast date is a real date field**, on the confirm screen and editable on the card. What the label
printed goes through `lib/dates.ts` first; an ambiguous `05/06/2026` is refused and shown as text.

**The bag pill carries "Beans ↗"** as a *sibling* of the expand toggle, never nested: an `<a>` inside
a `<button>` is invalid markup and browsers disagree about what a tap does. Keep them siblings.

**The guide tier is a three-state indicator** — green Found, amber Non-Specific, red No Recipe,
expanding to the quote. **The card is three sections**: This bag, Recipe, Brews, Save beside Delete.

**The icon is a pour-over in the JPS livery**, every colour a `theme.css` token. **Its two gold rules
are structural** — a near-black tile loses its edge on a dark wallpaper. It has **no alpha**.

## Traps specific to this app

- **An empty result and an unread result must not render the same.** Four times in this one app a
  failure rendered as a plausible empty answer. **Adding a read path here? Check this first.**
- **A bag needs a purchase date, and the error names it.** That empty field sent `{}`, the route
  correctly refused it, and the page said "Couldn't save that bag" about a bag saved minutes
  earlier. `lib/patch.ts` holds both halves: the requirement, and sending only what moved.
- **Neither model call can be exercised from a Claude Code sandbox.** Roaster domains are blocked by
  the egress proxy and the suggestion needs a real key. Tests cover the validation and the coercion
  against recorded shapes. **Do not conclude either feature works because the tests pass.**
- **Two brewer vocabularies, and `myBrewerFor` crosses only on an exact match.** A bare "V60" does
  not map: two are on the shelf and the roaster did not say which. Rounding is the same invention.
- **The icon is a static import**, from `/_next/static` — the one prefix the middleware excludes.
- **`guide_status` records where instructions were read, not who they were written for.** Sweet Bloom
  print the same recipe on every page, so nothing should rank or filter on tier 1.

## In flight

`claude/coffee-roast-date-and-suggested-recipe` — pushed, CI green. Roast date as a field, the
empty-PATCH save bug, the suggested recipe. **#124 merged at 15:26 UTC while this was being written**,
squashed, so `main` was merged in rather than this branch left standing on commits that no longer
exist there. Carries migration `20260919175624` — additive, so it rides with its code.

## Next

1. **Verify the suggestion on a preview with a real bag.** Nothing in the sandbox can.
2. **Run one coffee twice, Haiku then Sonnet 5 at `high`**, and compare the tiers. The open question.
3. The deliberately-unbuilt list — timer, inventory, method lookup table — stays unbuilt until asked.
