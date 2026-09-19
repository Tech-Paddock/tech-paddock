# Coffee — charter

You own `apps/coffee`, live at `coffee.techpaddock.io`. Nothing else in this repo is yours.

---

## Your job

Photograph a coffee bag, get **the roaster's own** brewing instructions for that coffee, and keep a
searchable library of what you have bought and how you brewed it.

The emphasis is the entire product. Any model can produce a brewing recipe. This tool exists to
retrieve the one the roaster actually published, and to say plainly when there isn't one.

## The flow

Photograph the bag → downscale in the browser → Claude reads roaster and coffee name off the label
→ **you confirm** → **save** → Claude searches for brewing instructions → the guide lands on the
saved bag.

The confirm step is not ceremony. A misread roaster name sends the search somewhere useless, and
it doubles as the manual-entry path when a photo cannot be read at all.

**Save comes before the search, not after it.** The search reads real roaster pages and runs
anywhere from thirty seconds to a few minutes, with nothing travelling on the connection while it
works — so a phone concludes the request is dead and the answer is lost even though the server
finished it. That happened on the first live run. The bag is therefore written first and the
search updates that row, which is what `guide_status: 'not_searched'` was always for. The page
polls the row rather than waiting on a response, so a dropped connection costs nothing and you can
close the tab mid-search.

## What you own

```
apps/coffee/
  app/page.tsx                 the UI
  app/api/identify/route.ts    vision call — reads the label
  app/api/search/route.ts      web search call — finds the guide
  app/api/bags/route.ts        list and create
  app/api/bags/[id]/route.ts   read, update, delete
  lib/anthropic.ts             both model calls live here
  lib/guide.ts                 validation — the rule this tool lives or dies on
  lib/methods.ts               the brew method vocabulary
  lib/bags.ts                  previous-purchase and roaster-domain lookups
  lib/image.ts                 browser-side downscale
  lib/storage.ts               photo upload, signed URLs
```

Database: the `coffee` schema — `coffee.bags` and `coffee.brews`, one to many. Storage: the private `coffee-files`
bucket.

---

## The three rules that are not yours to relax

### 1. No invented recipes, and it is enforced in code

A model with web search will happily produce a plausible 1:16 / 205°F / 3:00 recipe for a page that
says nothing about brewing. Unlike a bad message draft, **you would actually brew it.**

So nothing reaches the database unless the model also produced the sentence it came from and the
URL that sentence was on. That is enforced in `lib/guide.ts`, **not in the prompt**, because a
prompt can only ask. `validateGuide`:

- drops any parameter with no backing quote
- rejects quotes citing a page the model never reported reading
- refuses anything read off a site that is not the roaster's
- demotes a `coffee_specific` claim to `roaster_generic` unless the instructions were genuinely
  read on the product page itself

It never throws. A malformed response becomes `status: "none"`, which is a legitimate outcome.

Dropped values are surfaced in the UI next to what was kept, never silently discarded. The quotes
render beside the parsed values so a misparse is visible rather than invisible.

**Do not move any of this into the prompt. Do not add a parameter that bypasses it.**

### 2. Three tiers, and which one answered is stored

1. `coffee_specific` — instructions published for this exact coffee, on its product page
2. `roaster_generic` — the roaster's general brew guide, **from their own site only**
3. `none` — neither exists. A correct answer, and a recorded one

(`not_searched` is the fourth state, for a bag saved before any search ran.)

A house pour-over ratio is useful, but it is not what the roaster decided about this particular
lot. **Do not flatten the distinction.**

**The tier records where the instructions were read, not who they were written for.** That is the
only part a search can check, and the first real bag is the case that separates the two: Sweet Bloom
print one house recipe — Origami Air, 1:17, 900µm, 2:40 — on every product page, so it validated as
`coffee_specific` while being their default for everything. The classification is right; the old
label, "The roaster's recipe for this coffee", asserted the part that was never checked.

**The three tiers are now a three-state indicator, and every label names the place.** "Found Brew
Guide on Page", "Non-Specific Roaster Brew Guide", "No Recipe Found" — green, amber, red, with the
word carrying the same thing as the colour so the colour is never the only signal. The wording lives
in `lib/guideDisplay.ts`, deliberately apart from `lib/guide.ts`: presentation must not be able to
reach validation. A test there refuses any label that claims a recipe was *written for* this coffee.
The prose caveat that used to sit beneath tier 1 is gone, at Joel's instruction — **the quote itself
replaces it**, one tap under the indicator, which is the check rather than a sentence about it.

So **a `coffee_specific` guide is not evidence of a per-lot recipe**, and anything later that treats
it as one is reading more into the column than it holds. The one honest signal available is
cross-bag — two bags from the same roaster carrying identical values means it is boilerplate — and
it is deliberately not built, because there is one bag.

### 3. The roaster's values stay separate from yours

`guide_*` on the bag holds what was published; it is never overwritten by what you did. What you
dialled in lives on `coffee.brews`, one row per attempt — **the bag's own `my_grinder`,
`my_grind_setting`, `my_method` and `my_rating` columns were dropped on 2026-09-12** because one set
of columns can only hold the last thing you tried, which is the opposite of dialling in. `my_notes`
stays on the bag: it describes the coffee and outlives any one attempt at it.

Brewing their filter coffee as espresso records what you did without erasing what they suggested.
Keep it that way.

---

## Design decisions, and why

**Two brewer vocabularies, not one.** `guide_method` records what the roaster published and stays
broad, because it describes the world; `my_brewer` names the five things actually on the shelf.
They were one shared list until the first real bags arrived and every one of them was Sweet Bloom
publishing **"ORIGAMI AIR"** — a real dripper that no five-item list has room for. Narrowing the
shared list would have turned the roaster's own column into "other" for most of the specialty
world, which is information loss in the column whose entire job is recording what they said.

`myBrewerFor` carries the roaster's choice across **only on an exact correspondence**. Origami,
Chemex and espresso leave your brewer blank rather than rounding to the nearest cone, and a bare
"V60" leaves it blank too, because you own an 02 and a Switch and the roaster did not say which.
Rounding to the nearest thing on the shelf, on the roaster's authority, is the same species of
invention this tool refuses about brewing parameters.

**Brew method is a fixed vocabulary, not free text.** "V60", "v60" and "Hario V60" as three values
would quietly break grouping and filtering, and roasters' wording varies more than that.
`normalizeMethod` maps their phrasing onto the enum, ordered longest-phrase-first so "french press"
is not swallowed by "press", and generic filter language only wins if nothing specific matched.
Normalization runs against the **stored quote**, not a model-chosen label, so it stays auditable.

`null` means they said nothing; `"other"` means they said something unplaceable. Only the second is
worth storing — keep that distinction.

**Two URLs, not one.** `product_url` and `guide_url` are the same page at tier 1 and different
pages at tier 2. One column would lose which you are looking at.

**A bag is a purchase; a brew is one thing you did with it.** One bag, many brews. The bag holds
what is fixed the moment you buy it — identity, purchased date, photo, and the whole `guide_*`
block — and `my_notes`, which describes the coffee and outlives any one attempt at it. Everything
variable is a brew: brewer, brew method, grinder, grind setting, dose, beverage mass, TDS, rating,
and notes about that cup.

The dial-in used to live on the bag, as a single set of columns. One dial-in per bag can only
record the last thing you tried, which is the opposite of what dialling in is — a sequence of
attempts whose whole value is comparing them. This is the repo's "prefer append over rewrite for
anything that accumulates", applied to the thing that was accumulating.

**Deleting a bag deletes its brews**, by cascade, and its photo. The confirm names the brew count
for that reason: losing a dial-in history silently is worse than losing the photo.

**A new brew opens as a repeat of the last one, and as the roaster's numbers before that.** Dialling
in is one change at a time against everything else held still, so retyping four settings you did not
mean to change is how they drift — and a drifted setting is indistinguishable afterwards from a
deliberate one. `repeatOf` carries the decisions: brewer, brew method, grinder, grind setting, dose,
water and ratio. It carries no reading — beverage mass, TDS, rating and notes start empty, because
those describe one cup and a repeated one would record a measurement nobody took.

`openingBrew` then fills whatever the repeat left blank from the bag's own `guide_dose`,
`guide_water` and `guide_ratio`, so the first brew of a bag starts where the roaster said to start.
**Your last brew wins field by field**: once you have brewed it, their number is a fact about the
bag rather than an instruction, and letting it overwrite your setting would undo the previous
attempt every time the form opened. Grind is deliberately not carried across — "900µm" is a
particle size and the field it would land in is a dial position, and translating one into the other
is the rounding `myBrewerFor` refuses. **Nothing here is written**: these are prefilled inputs, and
only logging the brew stores them, which is what keeps a published number out of `coffee.brews`
unless you actually brewed it. Beverage mass and TDS both feed the generated extraction yield, so a stale
one produces a figure that is arithmetically correct about a brew that never happened. **Clear**
empties the form; it is beside the line saying the form was prefilled, so it undoes the thing it
sits next to.

This is the same line `findPreviousBag` draws across bags, drawn again within one.

**TDS is stored once, in percent.** A refractometer reads percent; everything else quotes ppm; they
are the same number and `1% = 10,000 ppm`. ppm is derived at display and never stored, because two
columns for one measurement is two things that can disagree. **Extraction yield is a generated
column**, not an input — it is a function of dose, beverage mass and TDS, and an editable copy
would be free to drift from the brew it claims to describe.

**The refractometer half of the form is commented out, on Joel's word, and none of the above
changed.** `tds_percent`, `beverage_g` and the generated `extraction_yield` keep their columns,
their comments and their tests; the form simply does not ask for them today, and a logged brew
still shows a reading it already carries. This is a decision about what is worth typing in a
kitchen, not about what is worth recording — so it is reversed by uncommenting, never by a
migration.

**A brew is planned in dose, ratio and water, and the ratio is not stored.** It is `water_g /
dose_g`, so a column for it would be the same mistake as a column for ppm or an editable extraction
yield: one fact with two homes. It is derived in `lib/brews.ts`, shown in the form, and dropped
before the POST. **`water_g` is water into the brew and `beverage_g` is what came out of it** — the
bed keeps roughly two grams per gram of coffee, and filling either from the other overstates the
yield by about a tenth, which is enough to relabel a brew that has not changed.

**Each purchase is its own row.** Roasters re-release the same coffee each crop, so "have I had
this before" is a lookup on `(lower(roaster), lower(coffee_name))`, not a uniqueness constraint.
`findPreviousBag` carries forward **only the dial-in** — method, grinder, grind setting. A rating
or tasting note describes a lot you actually drank, and this bag is not that lot.

**`findRoasterDomain` pins the search.** Once one verified product URL exists for a roaster, later
searches pin `allowed_domains` up front rather than leaning on the post-hoc host check. The first
search for an unknown roaster stays unpinned — guessing a domain from the roaster's name is exactly
the invention this tool refuses.

**It installs to the iPhone home screen, and is iOS-only on purpose.** The primary device is a
phone in a kitchen, so the tool is installed rather than opened in a tab: `apple-touch-icon` plus
the `apple-mobile-web-app-*` tags, which is all iOS needs. There is deliberately no web app
manifest. A manifest is fetched without credentials, so the password gate would return the login
redirect and the install would silently never offer itself; allowing it through means editing
`middleware.ts`, which is the password gate and is not Coffee's to change. If every tool
should be installable, that pattern belongs to TechPad Gen, not here.

The icon is a static import so it is served from `/_next/static`, the one prefix the middleware
matcher excludes. Next's own `app/apple-icon.png` convention is served from a gated route, and iOS
would fall back to a screenshot of the login page as the home screen icon.

**An installed app has its own cookie jar**, so signing in inside it is expected rather than a
session bug. It is also reached directly rather than through the hub's iframe.

**Images downscale in the browser** to 1568px on the long edge at quality 0.85. Three problems, one
fix: an iPhone shot is 3–5MB of HEIC, the Anthropic API accepts only jpeg/png/webp/gif, and Vercel
rejects bodies over ~4.5MB with an opaque error. 1568px is Claude's optimal size, so this costs no
accuracy.

**The search model and its effort are selectable; the label reader is not.** Which model retrieves
well enough is an open question, so the search offers Haiku 4.5, Sonnet 4.6 and Sonnet 5, with an
effort level where the model has one, and records both on each bag — a guide is only comparable
against another if you know what produced it, and effort is as much a part of that as the model.

The models do not take the same request, which is why both controls are derived from a registry in
`lib/models.ts` rather than being fixed dropdowns: the dynamic-filtering web tools need Sonnet 4.6
or better, Haiku 4.5 rejects `output_config.effort` outright so its list of levels is empty, and
`xhigh` exists on Sonnet 5 but not on Sonnet 4.6. Every one of those is a 400 rather than a
degraded result, so a level the model does not take is refused by the route and never offered by
the page — absent rather than greyed out, because a disabled control implies a setting that
exists. Reading a label is transcription, is
already fast, and stays on `claude-sonnet-5`.

Lowering the model does not lower the guard. `validateGuide` enforces quote-backing in code, so a
weaker model cannot invent a recipe — it can only fail to find one and report `none`. That is what
makes the comparison safe to run at all.

**The identify call uses `effort: "low"`** with a JSON schema. Reading a label is transcription, not
reasoning, and the round trip happens while you are standing in a kitchen holding the bag. The
system prompt forbids guessing a roaster from the design or completing a partially visible word.

---

## Guardrails

**Never touch:**

- The shared auth plumbing. Gated in `CLAUDE.md`; the TD owns it.
- Any app but `apps/coffee`, or any schema but `coffee`.

**Never do:**

- Weaken `validateGuide`, or add a path that writes a `guide_*` value without a backing quote.
- Store a brew parameter read from a site that is not the roaster's.
- Put a migration under `apps/coffee/`. One Supabase project means one history, at `supabase/` in
  the repo root — a previous branch got this wrong.
- Add a table pre-emptively. A brew log, a timer, inventory and a method lookup table are all
  expected eventually; each arrives as its own table when it is actually built. Promoting the
  method enum to a table later is an additive migration.

**Yours to use:** `ANTHROPIC_API_KEY` — shared with the Message Editor, and Coffee's arrival is why
that variable is no longer editor-only.

---

## Guidelines

- Run `npm test` and `npm run build` in `apps/coffee` before you push. Both pass on `main` today;
  if either breaks, that is yours.
- **The search step cannot be exercised from a Claude Code sandbox** — roaster domains are blocked
  by the egress proxy. Tests cover the validation logic against recorded response shapes. The
  search itself has to be verified on a deploy preview with a real bag. Do not conclude the feature
  works because the tests pass.
- When you add a guide field, add its test first. Every existing field in `GUIDE_FIELDS` has one,
  and the quote-backing rule is only as strong as its coverage.
- Prefer surfacing an uncertainty in the UI over resolving it in code. `dropped` exists because a
  value the model could not back is worth showing, not hiding.
