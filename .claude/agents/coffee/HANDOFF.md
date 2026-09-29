# Coffee — handoff

State as of 2026-09-29. Read `RULES.md` first; this file is only what is true right now and its traps.
Open work is in Linear, team TEC, under `agent:Coffee`.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, installed to the iPhone home
screen. The whole flow has run end to end against a real bag.

**Save comes before the search**, and the page polls the row rather than waiting: the search takes
minutes with nothing on the connection, so a phone calls it dead. **Search again** re-runs it from the
shelf and refreshes the link. **Nothing is pinned up front** (#176); `validateGuide` is the whole
constraint on where a guide may come from.

### What TEC-28 made true (2026-09-25)

- **Only the search writes `guide_*`.** `POST /api/bags` takes no guide; a bag is saved at
  `not_searched` through `guideColumns(null)`.
- **"The roaster's own site" is anchored on evidence**: the product page's site **and** a host the run
  reached (`reachedUrlsIn`), never the answer. Response → stored outcome is pure and tested in `lib/searchRun.ts`.
- **A `none` is refused only for service failures** (`too_many_requests`, `unavailable`, unlisted codes);
  a model-caused one records `none` **with a warning**, and a product link whose fetch failed is cleared.
- **The search has a clock.** 270 s budget inside the route's 300 s `maxDuration`
  (`lib/searchClock.ts`); a stamp older than 300 s reads as failed on both pollers. One search per bag:
  the route refuses a second with 409, and the button starts from the row's running search.
- **A failing run writes its error only onto its own stamp**, so it cannot land beside a recipe
  another run saved. A successful run always overwrites — freshest wins (Joel, 2026-09-24).
- **The label's roast date is read** (`roastDateFromLabel`). **`myBrewerFor` feeds `openingBrew`**; with
  your dose, their ratio sets the water. A failed suggestion writes only `suggested_error`.

### What TEC-47 made true (2026-09-25, under TEC-46's rule)

- **A recipe printed as an image is read.** Below tier 1 with a product page, `searchBrewGuide` fetches
  the page, takes its **product-gallery** images (≤6; `og:image` only as fallback) and one `claude-sonnet-5`
  call (low effort, no tools) copies out a printed recipe (`lib/recipeImage.ts`). It goes through
  `validateGuide` with its `images`: the page gets the site check, never the CDN; the image URL is a key on
  each quote in `guide_quotes` (no migration); no image → dropped; tier 1 needs every image in the gallery.
- **Filter/batch beats espresso**; the unchosen recipe is not `dropped`. A failed read is a warning, never a silent `none`.
- **The image sits inside the status disclosure**, under the quotes (`RecipeImages`) — Joel moved it
  there on 2026-09-29, lifting TEC-46's always-on-screen clause (charter wording: TEC-95).

### The bag's recipe is two sections (2026-09-29)

- **Roaster's Recipe, then Claude's Suggested Recipe**, one above the other, each a `<details>` open by
  default (`RecipeSection`), headings from `RECIPE_SECTIONS`. **Search again** is a bordered button in
  the first; **Suggest a recipe** is in the second on **every** bag — `/api/bags/[id]/suggest` no
  longer refuses a found guide. The search still suggests by itself on `none` only.
- **The suggestion is never shown the roaster's guide**, and its prompt no longer says none was found.

## Traps specific to this app

- **An empty result and an unread result must not render the same.** It has recurred in this app more
  than any other defect — the library, the brews list, the previous-purchase lookup, the search
  itself, the label date. **Adding a read path here? Check this first.**
- **`guide_search_error` holds two things, told apart by `guide_status`/`guide_fetched_at`.** Beside
  a fresh answer it is a warning; with no new answer it is the failure. Read both before showing it.
- **The reached-host anchor reads the real response** — TEC-58 passed live on 2026-09-26. If guides
  ever turn "No Recipe Found" dropped for "never reached", the tool result blocks changed shape.
- **`maxDuration = 300` in `app/api/search/route.ts` is a literal** (Next reads it statically) and must
  equal `SEARCH_STALE_MS`. Change one, change both.
- **No model call can be exercised from a Claude Code sandbox** — roaster domains are blocked and the
  calls need a real key. **Do not conclude any works because the tests pass.** The image read has never
  met a real page: gallery detection is a class/id pattern (`GALLERY`), and a theme it misses reads as
  "no card" with no warning. Middlestate's José Ramirez bag is the live test.
- **TDS, extraction, beverage yield and grinder have no `guide_*` column**; the copy-out keeps yield out of `water`.
- **`parseRatio` reads larger over smaller**: "16:1" and "1:16" are both 16, and "2:1" is 2.
- **`product_url` is still never quote-backed.** It is cleared when its fetch fails in a run, but a
  page the model names and nobody fetched is stored as named, and `Beans ↗` links it straight out.
- **Two brewer vocabularies; `myBrewerFor` crosses only on an exact match.** A bare "V60" does not map.
- **A date input on iOS sets its own minimum width**, turned off in `globals.css`.
- **Recipe sections nest `<details>`**: they use the named `group/section`, so `group-open` stays the header's.
- **The icon is a pour-over in the JPS livery**, every colour a token, **no alpha**, **a static
  import** from `/_next/static` — the one prefix middleware excludes.
- **"Beans ↗" is a *sibling* of the expand toggle** — an `<a>` in a `<button>` is invalid markup.
