# Coffee — handoff

State as of 2026-09-26. Read `RULES.md` first; this file is only what is true right now and its traps.
Open work is in Linear, team TEC, under `agent:Coffee`.

---

## What is true now

**Live at `coffee.techpaddock.io`**, behind the gate, on the iPhone home screen; run end to end.

**Save comes before the search**, and the page polls the row rather than waiting: the search takes
minutes with nothing on the connection, so a phone calls it dead. **Search again** re-runs it from the
shelf and refreshes the link. **Nothing is pinned up front** (#176); where a guide may come from is
checked after the run, in `lib/guide.ts` — `validateGuide`, then `anchorOnRoaster`.

### What TEC-28 made true (2026-09-25)

- **Only the search writes `guide_*`.** `POST /api/bags` takes no guide; a bag is saved at
  `not_searched` through `guideColumns(null)`.
- **"The roaster's own site" is anchored on evidence.** A guide needs a product page on an http(s)
  host, and must be on that same site **and** on a host the run reached (`reachedUrlsIn`, off the tool
  result blocks, never the answer). `javascript:` and friends are not URLs anywhere (`webHost`).
- **The product page itself carries the roaster's name (TEC-68).** `anchorOnRoaster`, run inside
  `concludeSearch`: its host must hold every word of the bag's roaster name less `NAME_FILLER`.
  Failing, the page is cleared, every value on its site is `dropped` with the reason, a warning says
  so, and with no product page left the gallery is never read.
- **The whole step from API response to stored outcome is pure and tested** in `lib/searchRun.ts`:
  `readTurn` (only `end_turn` answers; `max_tokens`, `refusal` and anything else throw; split text
  blocks rejoin with nothing between them), `concludeSearch` (validation, tool failures, stale link).
- **A `none` is refused only for service failures** — `too_many_requests`, `unavailable`, and any code
  not on the model-level list. A model-caused failure records `none` **with a warning** in
  `guide_search_error`, beside the answer; a product link whose fetch failed is cleared.
- **The search has a clock.** 270 s budget inside the route's 300 s `maxDuration`
  (`lib/searchClock.ts`); a stamp older than 300 s reads as failed on both pollers. One search per bag:
  the route refuses a second with 409, and the button starts from the row's running search.
- **A failing run writes its error only onto its own stamp**, so it cannot land beside a recipe
  another run saved. A successful run always overwrites — freshest wins (Joel, 2026-09-24).
- **The label's roast date is read** (`roastDateFromLabel`). **`myBrewerFor` feeds `openingBrew`**; with
  your dose, their ratio sets the water. A failed suggestion writes only `suggested_error`.

### What TEC-47 made true (2026-09-25, under TEC-46's rule)

- **A recipe printed as an image is read.** Below tier 1 with a product page, `searchBrewGuide` fetches
  the page itself, takes its **product-gallery** images (≤6; `og:image` only if no gallery is
  recognisable, never the page's other images) and one `claude-sonnet-5` call at `effort: "low"`, no
  tools, copies out any printed recipe. Rules are pure in `lib/recipeImage.ts`; fetches in `anthropic.ts`.
- **It goes through `validateGuide`** with its `images` argument: printed text is the quote, the page
  is the quote's URL and gets the site check (the image's CDN host is never checked), and the image URL
  is a key on each quote in `guide_quotes` — **no migration**. No image to show → dropped. Tier 1 needs
  every image in the gallery. A text answer's `image` key is stripped.
- **Filter/batch beats espresso**, on the card and against a text-found filter guide; the unchosen
  recipe is not `dropped`. A read that fails is a warning beside the text answer, never a silent `none`.
- **The image renders under the values it backs**, outside the quote disclosure (`RecipeImages`).

## Traps specific to this app

- **An empty result and an unread result must not render the same.** It has recurred in this app more
  than any other defect — the library, the brews list, the previous-purchase lookup, the search
  itself, the label date. **Adding a read path here? Check this first.**
- **`guide_search_error` holds two things, told apart by `guide_status`/`guide_fetched_at`.** Beside
  a fresh answer it is a warning; with no new answer it is the failure. Read both before showing it.
- **The reached-host anchor has never met a real response.** If the `_20260209` tools' results do not
  arrive as `web_fetch_tool_result` / `web_search_tool_result` blocks, every guide becomes
  "No Recipe Found", dropped for "never reached". TEC-58 is the check.
- **`maxDuration = 300` in `app/api/search/route.ts` is a literal** (Next reads it statically) and must
  equal `SEARCH_STALE_MS`. Change one, change both.
- **No model call can be exercised from a Claude Code sandbox** — roaster domains are blocked and the
  calls need a real key. **Do not conclude any works because the tests pass.** The image read has never
  met a real page: gallery detection is a class/id pattern (`GALLERY`), and a theme it misses reads as
  "no card" with no warning. Middlestate's José Ramirez bag is the live test.
- **TDS, extraction, beverage yield and grinder have no `guide_*` column.** The card shows them; the
  copy-out is told not to put a yield in `water`.
- **`parseRatio` reads larger over smaller**: "16:1" and "1:16" are both 16, and "2:1" is 2.
- **The name check has false negatives.** A domain that drops a word of the name (49thcoffee.com) or
  a misread roaster records `none`, reason beside it. `product_url` is still never required *reached*.
- **A date input on iOS sets its own minimum width**, turned off in `globals.css`.
- **The icon is a pour-over in the JPS livery**, every colour a token, **no alpha**, **a static
  import** from `/_next/static` — the one prefix middleware excludes.
- **"Beans ↗" is a *sibling* of the expand toggle** — an `<a>` in a `<button>` is invalid markup.
