# Coffee — handoff

State as of 2026-09-25. Read `RULES.md` first; this file is only what is true right now and its traps.
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
- **"The roaster's own site" is anchored on evidence.** A guide needs a product page on an http(s)
  host, and must be on that same site **and** on a host the run reached — taken from the tool result
  blocks by `reachedUrlsIn` in `lib/searchRun.ts`, never from the answer. `javascript:` and friends are
  not URLs anywhere (`webHost` in `lib/guide.ts`, which `hostOf` now shares).
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
- **The label's roast date is read**: `roastDateFromLabel` puts ISO in the form, or leaves it empty with
  the label's wording beside it. `noUnusedLocals` is on.
- **`myBrewerFor` is wired into `openingBrew`**, and dose/ratio/water now open consistent: with your
  dose, their ratio sets the water.
- A failed suggestion writes only `suggested_error`; the search's automatic suggestion gets only the
  time left in the function. Photos are signed in one batch; pollers pass `?photo=0`.

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
- **Neither model call can be exercised from a Claude Code sandbox** — roaster domains are blocked by
  the egress proxy and the suggestion needs a real key. **Do not conclude either works because the
  tests pass.**
- **`parseRatio` reads larger over smaller**: "16:1" and "1:16" are both 16, and "2:1" is 2.
- **A bag needs a purchase date, and the error names it.** `lib/patch.ts` holds both halves.
- **`product_url` is still never quote-backed.** It is cleared when its fetch fails in a run, but a
  page the model names and nobody fetched is stored as named, and `Beans ↗` links it straight out.
- **Two brewer vocabularies; `myBrewerFor` crosses only on an exact match.** A bare "V60" does not map.
- **A date input on iOS sets its own minimum width**, turned off in `globals.css`.
- **The icon is a pour-over in the JPS livery**, every colour a token, **no alpha**, **a static
  import** from `/_next/static` — the one prefix middleware excludes.
- **"Beans ↗" is a *sibling* of the expand toggle** — an `<a>` in a `<button>` is invalid markup.
- **`guide_status` records where instructions were read, not who they were written for**, so nothing
  ranks or filters on tier 1.
