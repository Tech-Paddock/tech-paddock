# Coffee — rules

`apps/coffee`, served at `coffee.techpaddock.io`. State and traps are in `NOTES.md`.

## Purpose

Photograph a coffee bag, retrieve the roaster's own brewing instructions for it, say plainly when
there are none, and keep a library of bags bought and brews made.

## Scope

- `apps/coffee`.
- The `coffee` schema: `coffee.bags` and `coffee.brews`, one to many.
- The private `coffee-files` bucket.
- `ANTHROPIC_API_KEY`.

## Core rules

- No brewing parameter is stored without the verbatim sentence it came from and the URL of that
  sentence's page.
- This is enforced in code, in `lib/guide.ts`, never in the prompt; a prompt can only ask.
- Do not weaken it, move it into the prompt, or add a write path around it.
- An empty result and an unread result never render the same.

## Flow

- Photograph → downscale in the browser → Claude reads roaster and coffee name → the user confirms
  → save → search → the guide lands on the saved bag; with no guide, a suggested recipe lands
  beside it.
- The confirm step is required. It is also the manual-entry path when a photo cannot be read.
- Save precedes the search. The search updates the saved row and the page polls the row, so a
  dropped connection or a closed tab loses nothing. A search runs for minutes with nothing on the
  connection.

## Rule 1: no invented guide values

`validateGuide` in `lib/guide.ts`:

- drops any parameter with no backing quote;
- rejects a quote citing a page the model did not report reading;
- refuses anything read off a site that is not the roaster's;
- demotes `coffee_specific` to `roaster_generic` unless the instructions were read on the product
  page itself;
- never throws; a malformed response becomes `status: "none"`.

Display:

- Dropped values are shown beside the kept ones, never silently discarded.
- Quotes render beside the parsed values.

### Recipe printed as an image

- A value read off an image reaches `guide_*` on the same terms as a sentence.
- Its quote is the text read off the image. Its URL is the page the image was on, and that page gets
  the roaster-site check. The image URL is stored beside it.
- The image's own host is not checked.
- The copy-out takes only what is printed. It never fills in or infers.
- The image always renders beside the values it backs. A value with no stored image is dropped.
- `coffee_specific` only for an image in this coffee's own product gallery; anywhere else on the
  site is `roaster_generic`.

### Suggested recipe

When the search finds no recipe, a model generates a suggested one. It never touches `guide_*`.

- A bag with no guide still reads "No Recipe Found".
- It lives only in `suggested_recipe` (`jsonb`: parameters, reasoning, model, timestamp).
- It carries no quote and no URL. `coerceSuggestion` drops any `status`, `product_url` or `quotes`.
- The call has no web search.
- Its heading states that it is a suggestion. The wording lives in `lib/guideDisplay.ts`, under a
  test that refuses wording claiming it was found, published or the roaster's. Never inline it in
  the card.
- It never prefills a brew. The user types it in. This is settled.

## Rule 2: three tiers, stored

1. `coffee_specific`: instructions on this coffee's product page.
2. `roaster_generic`: the roaster's general guide, from the roaster's own site only.
3. `none`: neither exists. A correct, recorded answer.

`not_searched` marks a bag saved before any search ran.

- Do not flatten the tiers.
- A tier records where the instructions were read, not whom they were written for.
  `coffee_specific` is not evidence of a per-lot recipe.
- Labels: "Found Brew Guide on Page" (green), "Non-Specific Roaster Brew Guide" (amber),
  "No Recipe Found" (red). The word always carries what the colour does.
- Labels live in `lib/guideDisplay.ts`, separate from `lib/guide.ts`; presentation must not reach
  validation. A test refuses any label claiming a recipe was written for this coffee.
- The quote sits one tap under the indicator. There is no caveat text.

## Rule 3: the roaster's values stay separate from the user's

- `guide_*` holds what was published and is never overwritten by what the user did.
- Each brew attempt is a row in `coffee.brews`. Never collapse attempts into columns on the bag.
- `my_notes` stays on the bag; it describes the coffee.

## Data model

- A bag is a purchase. It holds identity, purchased date, photo, the `guide_*` block and `my_notes`.
- A brew is one attempt: brewer, brew method, grinder, grind setting, dose, water, brew time,
  beverage mass, TDS, rating, notes.
- Each purchase is its own row. "Had this before" is a lookup on
  `(lower(roaster), lower(coffee_name))`, not a uniqueness constraint.
- `findPreviousBag` carries forward only method, grinder and grind setting.
- Deleting a bag cascades to its brews and deletes its photo. The confirm names the brew count.
- `product_url` and `guide_url` are separate columns; they differ at tier 2.
- One guide per bag. When a roaster prints filter (pour-over, batch, immersion) and espresso, store
  filter. Espresso only when it is the only recipe. The unchosen recipe is neither `dropped` nor a
  failure.
- Purchase date is required at the save step, in `lib/patch.ts`, with an error naming the field.
  The column stays nullable and `POST` does not demand it, because the row is written before the
  search.

## Vocabularies

- `guide_method` records the roaster's method and stays broad. `my_brewer` names the five brewers
  the user owns.
- `myBrewerFor` maps only on an exact correspondence. Origami, Chemex, espresso and a bare "V60"
  leave the brewer blank. Never round to the nearest owned brewer.
- Brew method is a fixed enum. `normalizeMethod` matches longest phrase first; generic filter
  language wins only if nothing specific matched. It runs against the stored quote.
- `null` means the roaster said nothing; `"other"` means they said something unplaceable. Keep both.

## Measurements

- TDS is stored once, in percent. ppm is derived at display.
- Extraction yield is a generated column, never an input.
- Ratio is not stored. It is `water_g / dose_g`, derived in `lib/brews.ts`, shown in the form and
  dropped before the `POST`.
- `water_g` is water in; `beverage_g` is liquid out. Never fill one from the other.
- The user's water and ratio round to whole numbers. `parseRatio` reports the roaster's ratio
  unrounded.
- Brew time is stored as whole seconds and typed as `m:ss`. A bare number is refused.
- Brew time is a reading: it does not carry into the next brew or prefill from `guide_time`.
  `guide_time` is the roaster's free text, verbatim.
- The refractometer fields are commented out of the form. Their columns, comments and tests stay,
  and a logged brew still shows any reading it carries.
  Restore by uncommenting, never by migration.

## Brew form

- A new brew opens as a repeat of the last. `repeatOf` carries brewer, brew method, grinder, grind
  setting, dose, water and ratio. Beverage mass, TDS, rating and notes start empty.
- `openingBrew` fills what remains blank from `guide_dose`, `guide_water` and `guide_ratio`. The
  last brew wins field by field.
- Grind is never filled from the guide; a particle size is not a dial position.
- Prefill writes nothing. Only logging the brew stores it.
- **Clear** empties the form and sits beside the line saying the form was prefilled.

## Search

- Nothing is pinned. No search sets `allowed_domains`; `validateGuide`'s host check is the whole
  constraint. `web_fetch` reaches only URLs search has surfaced, so pinning starves it.
- Search again from the shelf re-derives `product_url` and `guide_url` through `guideColumns`.
- The freshest successful result replaces the old one, even when it finds less.
- Search again uses the default model, offers no picker, and polls the row.
- The first search offers every model in `SEARCH_MODELS` (`lib/models.ts`), with effort where the
  model supports it. Both are recorded on the bag.
- Both controls derive from that registry. An unsupported level is refused by the route and absent
  from the page, not disabled.
- The label reader is one fixed model, `effort: "low"`, with a JSON schema. Its prompt forbids
  guessing a roaster from the design or completing a partly visible word.

## Client

- Images downscale in the browser to 1568px on the long edge at quality 0.85.
- iOS home-screen install only: `apple-touch-icon` and the `apple-mobile-web-app-*` tags.
- No web app manifest. It is fetched without credentials, so the gate would redirect it, and
  allowing it means editing `proxy.ts`, which is not Coffee's to change. Installability for every
  app belongs to the theme in `apps/home`.
- The icon is a static import served from `/_next/static`. Never use Next's `app/apple-icon.png`
  convention; that route sits behind the gate.
- The installed app has its own cookie jar; signing in there is expected. It is reached directly,
  not through the hub's iframe.

## Never

- Weaken `validateGuide`, or write a `guide_*` value without a backing quote.
- Add a table before the feature that needs it is built. Promoting the method enum to a table later
  is an additive migration.

## Testing

- The search cannot run from a sandbox; roaster domains are blocked. Tests cover validation against
  recorded response shapes.
- The search is verified in production with a real bag after merge; previews are skipped by every
  `ignoreCommand`. Passing tests do not show it works.
- A new guide field gets its test first. Every field in `GUIDE_FIELDS` has one.
