# Coffee — notes

What is true now and its traps. Rules are in `RULES.md`; open work is in Linear under `app:coffee`.

## Current state

- Live at `coffee.techpaddock.io` on Next 16 and React 19, behind the gate in `proxy.ts` on the
  Node runtime. The flow has run end to end.
- Every model call (label, search, recipe card, suggestion) sends `MODEL` at `output_config.effort:
  EFFORT` from `lib/models.ts`: `claude-sonnet-5-5` at `medium` since TEC-133. No `thinking` is
  sent, so Sonnet 5.5 thinks adaptively. `tests/anthropic.test.ts` pins every request.
- `POST /api/search` ignores a `model` or `effort` in the body. Bags searched before TEC-133 keep
  their recorded `guide_model`/`guide_effort` (Haiku 4.5, Sonnet 4.6 or Sonnet 5), and old
  suggestions their `model`; `modelLabel` names them.
- Each call refuses a turn that did not end in `end_turn`, `refusal` included: the label reader
  throws (the page shows the error on the manual-entry screen), the suggestion records
  `suggested_error`, the card read is a warning.
- Only the search writes `guide_*`. `POST /api/bags` takes no guide; a bag is saved at
  `not_searched` through `guideColumns(null)`.
- A guide needs a product page on an http(s) host, and must sit on that page's site and on a host
  the run reached. Nothing ties the product page to the roaster. Reached hosts are read from tool
  result blocks by `reachedUrlsIn` (`lib/searchRun.ts`), never from the answer. `webHost` refuses
  `javascript:`.
- `lib/searchRun.ts` maps a response to a stored outcome, pure and tested: `readTurn` answers on
  `end_turn` and resumes on `pause_turn` (anything else throws; split text rejoins with nothing
  between), then `concludeSearch`.
- Service failures (`too_many_requests`, `unavailable`, any code not on the model-level list) record
  no `none`. A model-caused failure records `none` with a warning in `guide_search_error`. A product
  link whose fetch failed is cleared.
- The search budget is 270 s inside the route's 300 s `maxDuration` (`lib/searchClock.ts`). A stamp
  older than 300 s reads as failed on both pollers.
- One search per bag: a second gets 409, and the button resumes the running search.
- A failing run writes its error only onto its own stamp. A successful run always overwrites.
- The label's roast date is read by `roastDateFromLabel`.
- `myBrewerFor` feeds `openingBrew`. With the user's dose, the roaster's ratio sets the water.
- A failed suggestion writes only `suggested_error`.
- Image recipes: below tier 1 with a product page, `searchBrewGuide` fetches the page, takes up to
  six product-gallery images (`og:image` only when no gallery is recognised), and one model call,
  without tools, copies out any printed recipe. Rules are
  pure in `lib/recipeImage.ts`; fetches are in `anthropic.ts`.
- The image URL is a key on each quote in `guide_quotes`. Tier 1 needs every image in the gallery.
  A text answer's `image` key is stripped.
- A failed image read is a warning beside the text answer, never a silent `none`.
- `RecipeImages` renders the image under the values it backs, outside the quote disclosure.
- Nothing detects cross-bag boilerplate (identical values on two bags from one roaster).

## Traps

- Empty versus unread is the most recurrent defect here: library, brews list, previous-purchase
  lookup, search, label date. Check it on every new read path.
- `guide_search_error` beside a fresh answer is a warning; with no new answer it is the failure.
  Read `guide_status` and `guide_fetched_at` before showing it.
- Thinking counts toward `max_tokens`, and at `medium` Sonnet 5.5 thinks before almost every
  reply. The budgets in `lib/anthropic.ts` were raised for it when the model changed; a lowered one
  shows up as a `max_tokens` stop, never as an empty answer.
- The web tool versions in `lib/models.ts` belong to the model. A model change rechecks them.
- `maxDuration = 300` in `app/api/search/route.ts` is a literal Next reads statically. It must equal
  `SEARCH_STALE_MS`.
- No model call runs from a sandbox, so the image read is untested on a real page. Gallery
  detection is a class/id pattern (`GALLERY`), and a theme it misses reads as "no card" with no
  warning.
- TDS, extraction, beverage yield and grinder have no `guide_*` column. The copy-out is told not to
  put a yield in `water`.
- `parseRatio` reads larger over smaller: "16:1" and "1:16" are both 16; "2:1" is 2.
- `product_url` is never quote-backed. A page the model names but no one fetched is stored as named,
  and "Beans ↗" links it directly.
- An iOS date input sets its own minimum width; `globals.css` removes it.
- The icon has no alpha, uses only tokens, and is a static import from `/_next/static`, the one
  prefix `proxy.ts` excludes.
- Next 16 renders `appleWebApp.capable` only as `mobile-web-app-capable`. `metadata.other` in
  `app/layout.tsx` adds the Apple-prefixed tag; keep both.
- Turbopack refuses an ICO with non-RGBA PNG frames. `app/favicon.ico` is RGBA with opaque alpha; a
  replacement must be too, or `next build` fails.
- No GET route is cached. Adding `revalidate`, `force-cache` or `"use cache"` brings back stale reads.
- "Beans ↗" is a sibling of the expand toggle; an `<a>` inside a `<button>` is invalid.
