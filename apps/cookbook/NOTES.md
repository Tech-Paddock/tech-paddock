# Cookbook — notes

What is true now, and its traps. Rules are in `RULES.md`; open work is in Linear.

## Shape

- Next 16, React 19. Gate: `proxy.ts`, Node runtime, the one gate every app runs; `drift` fails a
  `middleware.ts`.
- Tabs in `lib/tabs.ts`, rendered by `app/Cookbook.tsx` as one scrolling row of pills, **in the order
  Recipes · Grocery list · Deals · Add · Your brands** (TEC-189): `/` Recipes, `/list` Grocery list
  (renamed from "King Soopers list"; **the path stays `/list`** because Health redirects to it; signed
  out, it round-trips `/login?from=/list`), `/deals` Deals (`DealsTab.tsx`, TEC-132), `/add`
  (`AddRecipe.tsx`), `/brands` Your brands (`Brands.tsx`, TEC-131). All panels stay mounted; a send or refresh on the
  list bumps Your brands, and an edit in Your brands reloads the list. Results are toasts; a failed
  read stays inline.
- **The look is the owner's mockup of 2026-10-23** (TEC-135; the canvas is linked from TEC-135):
  bold headings with a one-line count under them, cards on `bg-surface` with no border, segmented
  switches on `bg-raised`, uppercase section headings, sticky action bars at the bottom. Theme
  tokens only; the mock's peach and green stood in for the livery. Deals (TEC-132) follows the same
  look (`Deals.dc.html` in the same canvas): green is the livery's accent, red its danger.
- Install icon: `app/apple-touch-icon.png` (No. 12, full-bleed) with `appleWebApp` metadata; its
  colours are fixed in dark mode too.
- No GET route is cached; caching would serve Health stale servings.
- **One model, set in `lib/models.ts`** (TEC-133): every call (pricing, Ask Claude, link, file, edit
  re-price, Tidy, and a resumed `pause_turn`) goes out as `claude-sonnet-5-5` at effort `medium`
  through `requestShape`, with `THINKING_HEADROOM` added to `max_tokens` because thinking counts
  against it. No picker; the draft and edit routes ignore a `model` an older page sends. A kept
  recipe keeps the model that priced it, and `modelLabel` still names Haiku 4.5 and Sonnet 5 for
  those rows; the save route accepts any model `lib/models.ts` labels, so a draft made before a
  deploy and kept after it is not refused. `tests/models.test.ts` fails if any other file under
  `app/` or `lib/` names a model id, an effort, a thinking or sampling setting, `tool_choice` or a
  tool version. Tool-less calls send a JSON schema; every call checks `stop_reason`, and a
  `refusal` or `max_tokens` throws a sentence with no retry or fallback.
- **Sonnet 5.5 400s on** `thinking: {type: "disabled"}`, `budget_tokens`, non-default
  `temperature`/`top_p`/`top_k`, forced `tool_choice`, and a prefill. Its default effort is `high`,
  so `medium` is always sent. The draft route allows 300 s, the edit route 120 s.

## Recipes

- **Add's order is Ask Claude · Link · File · Type it, and it opens on Ask Claude** (TEC-135,
  `MODES` in `AddRecipe.tsx`). The modes' behaviour is unchanged.
- **A recipe on the list is three short text lines** (TEC-189, `RecipeCard` in `Book.tsx`; replaces
  TEC-183's pill with tiles): the name; "5★ · Prep 15m · Cook 30m · makes 4" (`factsLine`,
  `lib/recipeView.ts`; each part absent when unset, and the old `total_minutes` ("35 min") stands in
  only while neither prep nor cook is set); one serving as text, "520 kcal · 38p · 42c · 18f"
  (`macrosLine`). The four macro tiles are gone from the list (`MacroTiles` still draws the Macros
  tab). **Origin is not on the facts line** (it did not fit beside Prep and Cook at 360px); the open
  recipe still says it. Meal, main, cuisine, equipment, diet and tags are stored and editable in
  Edit and the typed form, and **render nowhere**: not on the list, the open recipe or Add's draft.
  *On the menu* stays beside the book.
- **Prep and cook minutes** (TEC-189, the `cookbook_prep_cook_minutes` migration): two nullable
  columns on `recipes`, bounds as `total_minutes` (1 to 2880). `total_minutes` is **kept, not
  dropped**: 2 of 3 live recipes held it at the time, nothing converts it, and the Edit form shows a
  "Total" box only for a recipe that has one and neither prep nor cook. A model is asked for
  `prep_minutes` and `cook_minutes` (`META_SCHEMA_PROPERTIES`, `META_PROMPT`), no longer for a total,
  through all four ways in; `readMeta` is the one reader. `timeMinutes` (`lib/metadata.ts`) is prep
  plus cook (whichever is set), else the total: the book's "Under N minutes" filter and Ask Claude's
  overrun note use it, and a recipe with nothing set never matches. Health's `GET /api/servings`
  does not carry either column.
- **An open recipe is in tabs** (TEC-183, `app/RecipeDetail.tsx`; replaces TEC-140's layout): the
  name, "origin · makes N · time", the rating as five tappable stars (the PATCH call; tapping the
  set star clears it) with "N of 5" or "Not rated", then a `role="tablist"` of **Ingredients ·
  Method · Macros**. It opens on Ingredients; the tab is `RecipeCard` state, so it is held while
  the card is mounted (not across a reload). Ingredients put a leading amount in its own column
  (`splitIngredient`; a line that does not lead with one is shown whole). Method is numbered steps
  in circles. Macros (`app/MacroTab.tsx`) is one serving's tiles, the calorie split bar
  (`calorieSplit`, `lib/breakdown.ts`), the whole-pot line (`potAndServing`) and the provenance.
  Stored numbers only; nothing is called. The segmented tabs, circles, chips and bar are local
  patterns.
- **Add to list** is a card under the tabs (`AddToListCard`, TEC-189): "When are you cooking it?" is
  **one date box opening on today** with an Add to list button beside it (the day chips and "Pick a
  date…" are gone, with `dayChips` and `addButtonLabel`), then Edit and Remove as outlined buttons
  (Remove keeps its confirm). The helpings estimator and the pricing note are gone. The day sent is
  still `YYYY-MM-DD` from `parseDay`; a cleared date disables the button.
- **Tests render with `react-dom/server`** (`tests/recipeOpen.test.ts`): there is no DOM or click
  harness here, so a tab "switch" is asserted by rendering `RecipeOpen` with each `tab`, not by a
  click.
- **Clark's dark values are softer** (TEC-183, `packages/shared/lib/theme.css`, stamped to every
  app; only Clark differs): paper `#1A241F`, surface `#24322A`, raised `#324439`, ink `#EEF3EF`,
  ink-soft `#B8C9BE`, accent `#F0CE5C`. The bar stays dark and unchanged. `tests/clarkDark.test.ts`
  reads the stamped copy. **Trap:** home's rule ("at or below the lowest any other livery has")
  cannot hold for ink on paper, surface and raised, because softer is the point; the test holds
  those at their measured numbers and holds every other changed pair to the old rule, plus 4.5:1 /
  3:1 absolutes. Three tokens beyond the canvas were lightened to keep their pairs: `line`
  `#688071`, `danger` `#FFB4AC`, `sev-urgent` `#F8788C`.
- **The split divides by the macros' own calories at 4/4/9, not the stored kcal**, rounded by
  largest remainder so it adds to 100, and is labelled approximate. (The book's High protein
  filter, which divided by the stored kcal, was dropped in TEC-189.)
- The typed path runs a name check before its pricing call.
- An import is also refused when no fetch returned a page (`lib/fetchRun.ts`).
- **Something else** re-asks with every turned-down draft and its reason (`lib/reroll.ts`); **Bin
  it** is a turn-down. The pile is browser state, cleared by Keep it or a new ask.
- Ask Claude's pickers (meal, diet, cuisine, time; `lib/tuning.ts`) are requirements. Diet is tagged
  only where the model agrees, else noted. Book filters are the same four, as **one row of
  four compact selects** under the search at 360px (`BookFilters`, `app/Tuning.tsx`; High protein
  was dropped, TEC-189); an unset field never matches.
- Metadata sits flat on `recipes`, read by `lib/metadata.ts`. `meal` and `diet` are
  check-constrained to `MEALS` and `DIETS`; `readMeta` drops free-of claims and macro tags. The
  rating is read only from this app's forms. Older rows read "not set" until supplied (TEC-52).
- Editing (`lib/edit.ts`) re-estimates the whole pot whenever the ingredient list changes at all
  (reordering counts), in one call before the one write; servings alone re-divides the pot. Confirmed for TEC-140: changing
  ingredients updates the macros, and the breakdown reads the row that comes back, so it follows.
- `methodSteps` splits only on the next number in a run ("gas mark 4" stays); its tests hold the
  edges.

## Tables (`cookbook`)

Reasoning is in the migration headers.

- `recipes`: `macro_source` has no `web`; a unique index refuses a duplicate name.
- `grocery_items`: `quantity` 1–99; `recipes` is a snapshot of names, so a rename never reaches
  it. Tidy (checked by `validateTidy`) unions names, takes the larger of the largest absorbed
  quantity and the fixed rules' quantity for the merged line, and the latest `sent_at`. "Milk — the
  small tin" is a name and a note; only the name is searched.
- `products` (`cookbook_products`, TEC-131): **Your brands, one row per product code**
  (`product_id`, unique, 8–14 digits). `names` text[] (at least one; matched in code), `count`
  (+1 per Send add via `bumpCounts`; set absolutely by a batch; the editor never sets it),
  `size_first` (never overwritten by a refresh, which only fills it when empty; a batch fills it
  only when empty; the editor can correct it), `brand`/`note` (owner's words; a `note` starting
  `check:` lists the row under Fix these), `default_for` (TEC-135, below), Kroger's fields
  (`description`, `kroger_brand`, `size`, `url`, `price`, `in_stock`, `checked_at`,
  `missing_since`), `successor` jsonb, and the optional pack conversion `pack_label` (shopping unit
  shown on the list, "Heads of Garlic"), `pack_size` + `pack_unit` (together or neither: 1 holds
  10 cloves). Reads/writes in `lib/productStore.ts`; rules in `lib/brands.ts`. Changing a row's
  code in the editor clears Kroger's fields.
- `products.default_for` (`cookbook_product_defaults`, TEC-135): text[], the names (as matched,
  `normalizeName`) this product is the **default** for. No index can hold one per name across
  rows, so `setDefault` (`lib/productStore.ts`, from `defaultPatches`) takes the name off every
  other row before adding it, and `defaultFor` reads two claims as none, so a race reads as Pick
  one. An element that is no longer one of the row's names is ignored, and an edit of the names
  drops it (`keptDefaults`). A successor replace keeps it. **Not in the batch format**: Export
  leaves it out and Paste a batch never sets it.
- `brand_preferences`: since TEC-131 **only its `terms` and old `plain` rows are read**
  (`readPreferences` filters `kind <> 'product'`). Its `product` rows were copied to `products` by
  the migration and are kept, unread (their drop is TEC-131, parked); their phrases still hold the
  unique phrase index, so search words on such a phrase are refused with a sentence.
- `menu`: one row per recipe with a `day`, set only beside *Add to list*; re-adding moves it.
  Shown per serving. Nothing expires; ✕ or Clear all.
- `kroger_connection`: one row (`id` can only be true), the refresh token sealed with AES-256-GCM
  (refused without `v1:`), the store, `refreshed_at`, `modality` (PICKUP or DELIVERY, default
  PICKUP; a disconnect deletes the row and the choice with it).
- `brand_products`: no longer read or written (TEC-131); its fields were copied onto `products`.
  Its drop, with the old product rows, is TEC-131 (parked).
- `cart_sends` (TEC-127): the cart ledger, insert only (`lib/cartSends.ts`) except `item_id`,
  which a Tidy moves onto the merged line before deleting the old ones. Signed quantity: `sent`
  and `refused` positive, `taken_back` negative; the sum per line, UPC and modality is what Take
  back removes. `item_id` is set null when a line is cleared, and those rows are never taken back.
- `price_nights` (TEC-132): one row per saved product, **store and Denver night**, insert only,
  unique on all three (`lib/priceStore.ts`, `on conflict do nothing`). `regular` and `sale`
  (Kroger sends 0 for no promo; read as null), `in_stock`, `aisle` (Kroger's first category, which
  the Deals tab groups by). A row needs a price (check); no product code foreign key, so forgetting
  a product keeps its history.
- `price_weeks` (TEC-132): the Monday roll-up, one row per product, store and Monday, insert only:
  `low`, `high`, `mean` (4 places), `regular_mean`, `nights_on_sale`, `nights_seen`. Nightly rows
  are never deleted.
- `coupons` (TEC-132): **read path only** (`lib/couponStore.ts`; nothing writes it yet): `title`,
  `amount` text as shown, `expires_on`, `week_seen` (a Monday), `product_ids` text[] (codes; may be
  empty). Unique per week seen, title and amount. No expiry counts as active for two weeks
  (`lib/couponRules.ts`).
- `deal_scans`: one row per deal scan, insert only (`lib/dealStore.ts`). Deals, unpriced names and
  failures are jsonb arrays; the store is copied onto the row, so a store change never rewrites
  an old scan.

## Send to cart

- `/kroger/connect` and `/kroger/callback` are route handlers outside `/api/`, so an expired
  session bounces through login.
- `REDIRECT_URI` (`lib/kroger.ts`) and `CHECKOUT_URL` (`lib/kingsoopers.ts`) are constants.
- OAuth `state` is a signed nonce, double-submitted in an httpOnly `/kroger` cookie
  (`lib/krogerCrypto.ts`).
- The access token is never stored; each request refreshes once (`withAccessToken`) and reseals a
  rotated refresh token. `tests/kroger.test.ts` checks no route body carries a token.
- Scopes: `cart.basic:write product.compact`. A missing variable is named on the list tab and in
  `/api/health`.
- `GET /api/kroger/cart` is the review. **Which products decide a line** is `decide`
  (`lib/brands.ts`), one copy for the review, the list's prices, the deal scan, the list's links and
  marks: (1) a line that is 8–14 digits is that code, saved or not; (2) saved names as whole words,
  longest first, every product carrying the longest matching name a candidate; a search-word
  phrase longer than that decides instead, and on equal length products win. Among several
  (TEC-135), **a product the line names** wins (`namedAmong`: the line's item words beyond the
  matched name all in exactly one candidate's description or names, "sourdough" in "sourdough
  english muffins"), else **the matched name's default** (`defaultFor`); either is `chosen` and
  moves first. `matched` is the one name that matched (null when two different names of equal
  length did: no default then). (3) Only when no name matched, the item alone (`itemWords`)
  against each product's `description`, every item word a whole word in any order, a trailing
  s/es either side: `via: "description"`, **unconfirmed** until Send checks it. Candidates are
  most counted, then most recently updated.
- `planLine` (`lib/cart.ts`): one candidate, or a `chosen` one, is `exact` (*Going in*, carrying
  every option for "tap to change" and `chosen: one | default | named`); several and none chosen
  is `settle` (*Pick one*, carrying `matched`); anything else is a Kroger search (`match` /
  `none`). **The official-name check** (TEC-135): `search` returns up to `CHECK_RESULTS` of
  Kroger's results for the item (`searchProducts`); a `description` candidate passes only when its
  code is among them. One passing is `exact`, several `settle`; none falls to `match` with that
  search's top result. Tests: `tests/sendDefaults.test.ts` ("8 oz spaghetti" vs a sauce, "1 tsp
  salt" vs caramels, `fetch` stubbed).
- **The review** (`SendView`, `app/Cart.tsx`) replaces the list on the list tab, with *← Back to
  the list*; nothing goes in until **Send N to cart**. One list in sections: *Pick one* (most
  bought pre-picked; opens on the first), *Going in* (tap to change) and *Not saved yet* (ticked;
  *Paste a product page*). **Since TEC-190 it holds only lines still on the List**: `GET
  /api/kroger/cart` leaves out lines with `sent_at` (it still returns `alreadySent`), the *Already
  sent* section and its "add again" box are gone from the screen, and `?ids=a,b` limits the review
  to those lines (Add to cart on one line).
  A picked option is filled with the accent. **Make default** (a checkbox, only where `matched`
  and several options) rides on the pick as `makeDefault`. **Not this trip** is the only way a
  line with a product stays out; a line with nothing to add is sent as a bare `{id}` and comes
  back "No product to add.". After Send the same view shows every outcome, and **Still on your
  list** names every line this send left unsent. The rows, filled options, boxes and section
  headings are local patterns in `app/Cart.tsx`.
- **Make default on Send**: the route reads each ticked line's `matched` name **before** sending
  (remembering a pick can add the line's own name to the product, which would change what it
  matches), and `sendLines` calls `makeDefault` only after that line's add succeeded, after
  remembering. A failure is appended to the line ("Couldn't make it the default … do it in Your
  brands"); the line stays added.
- A line left out of the picks reports skipped, "Not this trip — still on your list."
- The state is `useCart` (`app/Cart.tsx`); `List.tsx` lays out `SendView`, the **List** and **In
  cart** sections, `RefreshLog` and `CartPanel` (connection, store, Refresh now; **no deals since
  TEC-132**, they live on the Deals tab). The sticky `CartBar` is gone (TEC-190): **Send all to
  cart** ends the List section, **Clear cart** and **Go to checkout** end In cart.
  `serialKroger` is module-level, so the list and Your brands' Refresh share one Kroger queue.
- **List and In cart** (TEC-190): a line is In cart when `sent_at` is set (Send sets it, a whole
  Take back clears it), so the sections need no new column and no migration. **Add to cart** on a
  line (`addOne`): `GET /api/kroger/cart?ids=<id>`, and when the plan is `exact` the pick is
  posted at once (`POST` with `only: [id]`, which limits what the server sends and reports) and the
  outcome is a toast; a Pick one, Not saved yet or no-product line opens `SendView` with that line
  alone (`reviewOnly`). **Remove** (`removeOne`) is `POST /api/kroger/cart/take-back` with `ids:
  [id]`; **Clear cart** is the old two-tap Take back (GET preview, then `confirm: true`, no `ids`).
  The In cart total and the "Shows what Cookbook put in your cart" caveat are the screen's own
  statement that the API cannot read the account. A ticked line that is also in the cart sits in
  In cart (no tick there). **Tidy and Clear all / Clear ticked / Copy read the List only**: a line
  in the cart is never merged into a tidy or deleted without a take back.
- **Searching by the item alone** (TEC-131): `lineTerm` (`lib/cart.ts`) is
  `searchTerm(itemWords(name)) ?? searchTerm(name)`, used by `planLine` and `targetFor`; a
  phrase's search words are searched as written. The list's links use `itemWords` too
  (`linkFor`, `lib/preferences.ts`). Rule and edges: `lib/itemWords.ts`,
  `tests/itemWords.test.ts`.
- **Remembering** (TEC-128, TEC-131): whatever goes in other than a Going in line's own product,
  a Pick one pick, a changed Going in pick, a pasted page or the tapped top match, goes through
  `rememberProduct`: the line's name
  (`splitLine`, so never the note) is added to the names of the row with that code, or a new row
  is made (`size_first` = the match's `size`, which the client sends beside `match`; null for a
  pasted page until the next refresh fills it). The client sends the page as `match` beside its
  `upc`; an exact line sends none and is never re-saved. Only after that line's add succeeded
  (including the retry without Pickup/Delivery); a failed add saves nothing. A page whose digits
  are not the UPC that went in is not saved. A failed save is appended to the line's detail; the
  line stays added. A code typed as the line, not saved, goes in but is not remembered. After
  `markSent`, `bumpCounts` adds one per added UPC (read, then update each row; `updated_at`
  untouched); a failure joins `recordError`.
- A send re-picking a line with `sent_at` returns 409 before Kroger is called, unless `again`.
- A send appends a `sent` row per added line (`sentRows` in `lib/cart.ts`): the UPC that went in,
  the quantity sent, and the modality it actually went with (null when Kroger refused the choice).
  A failed append is named in `recordError`; the items are still in the cart.
- **Take back** (TEC-127): rules in `lib/takeBack.ts`, route `/api/kroger/cart/take-back`. GET
  reads the ledger for the confirm (no Kroger call); POST needs `confirm: true`. Only lines still
  on the list, ticked or not. Per line it appends the `taken_back` rows first, then sends
  `PUT /cart/add` with the negated quantity and the recorded modality (`takeBackFromCart`), never
  retried without it; a refusal appends `refused` rows and the line stays sent. Only lines wholly
  taken back get `sent_at` cleared (`markUnsent`). A line with `sent_at` and no ledger rows was sent
  before the ledger and is skipped, with a pointer to the cart page. The summary always says
  anything added elsewhere is still there; any failure shows the `CHECKOUT_URL` link. The button
  and confirm are local patterns in `app/Cart.tsx`. **Remove** sends `ids` (TEC-190): the same
  reserve-then-ask path for one line, with its recorded Pickup/Delivery choice, never retried
  without it; a line sent before the ledger is skipped and says so, and stays In cart.
- Refresh: `lib/refresh.ts`, `POST /api/kroger/refresh`, triggered by `lib/refreshDue.ts`. No cron of its own (the nightly price scan, below, is separate).
  Every saved code in one `productsByIds` (50 per request); a code absent from the answer is
  flagged (`missing_since` kept from the first time) and Kroger is searched by its `description`
  (else its first name), ten results, for the **closest by name** (`closestProduct`: shared words
  over all words, Kroger's order breaking a tie, never a code already saved), stored as
  `successor`; a failed search keeps the old offer. Writes run four at a time. Drift (`sameSize`
  false between `size_first` and the size now; "1 lb" equals "16 oz") is named in the report.
  Search-word phrases are counted, not checked. `refreshed_at` moves only when products were
  checked. **The log is collapsed** (TEC-190): `RefreshLog` (`app/Cart.tsx`) shows
  `refreshSummary(report)` (`lib/refreshNote.ts`: "Checked 391 products · 391 updated · 27 sizes
  changed", plus any not returned or not checked, in the warning colour) in a `<details>` that
  starts closed; the old sentence is inside. A failed refresh, or a reply with no report, stays
  as plain text and an alert.
- **Replace** (`POST /api/brands/successor`): moves the code, page, description, size and
  price to the successor's; keeps names, count and `size_first` (so a smaller successor shows as
  drift); refused when another row holds the successor's code. Only on the tap.

## Prices (TEC-121)

- Pure logic in `lib/pricing.ts` (the deal scan; `lookUp`, `targetFor`), wired in `lib/dealRun.ts`;
  `lib/decide.ts` is the one brand decider for the review, the list's prices and the scan, so a
  line is priced as what Send would add
  (its default or named product first). A line decided only by a product's Kroger name is priced
  as Kroger's top match for the item (`targetFor`), because only Send checks that product.
  Exact IDs go in one `productsByIds` call (50 per request); searches run four at a time.
- Deal scan: `GET`/`POST /api/kroger/deals`. Every saved product (by code), every search-word
  phrase, plus every open line; a deal is `promo < regular`, sorted by percent off, then dollars.
  Runs when any Cookbook page loads and the latest scan is over seven days old (`scanDue`): every
  tab panel is mounted, and the cart hook's mount effect starts it. **No panel shows it and there
  is no Scan button (TEC-132)**: it feeds only the Deals board's products
  with no fresh night (the list's sale bubble reads the nightly prices since TEC-196). A scan that throws saves nothing, so the next page load retries, and the
  King Soopers panel says so in red.
- Coupons are never read here. The *Find coupons* link left with the panel (TEC-132), and
  `couponsUrl` with it.
- **No live estimate since TEC-190.** `POST /api/kroger/estimate`, `runEstimate`, `estimate`,
  `describeEstimate`, the *Calculate estimated total* / *estimate it* buttons and `EstimatePanel`
  (and `app/Deals.tsx` with it) are gone. **The list's totals are summed from the nightly check**
  (`lib/listPrices.ts`, pure, the browser runs it): `GET /api/grocery` reads the connection's store
  and `readNightsSince` (12 weeks since TEC-196, for Best; the newest night within
  `PRICE_WINDOW_NIGHTS`, 5, counts for the price), takes each product's newest
  night, and gives each line `price: {unit, total, onSale, night}` or `null`. The product a line is
  priced as is `productFor`: the only saved product, a chosen one (default or named) or the single
  Kroger-name match; an unsettled Pick one is **not guessed**, so it reads "no price yet" until a
  pick makes it one. A line with no product or no night is "no price yet", never $0, and each
  section's total line counts them ("about $21.46 · 1 no price yet"). The header names the night
  the prices are from ("prices from the night of Oct 28", or "Oct 26 to Oct 28" when lines differ).
  A failed price read comes back as `priceError` beside the list, which still renders. Totals are
  Kroger's shelf price at the store before tax and coupons, not what the cart will charge:
  Pickup/Delivery no longer prices anything.
- Pickup/Delivery: `PATCH /api/kroger`, `lib/modality.ts` (no imports; the browser runs it). Send
  puts `modality` on each `/cart/add` item; a 400 or 422 is retried once without it, the rest of
  that send goes without, and `modalityWarning` says so. Not retried on 401, 403 or an outage.
- **The sale/coupon bubble, the shade and Best on a list line** (TEC-196). `lib/saleTag.ts` is
  gone (it read the weekly scan); `lib/lineDeal.ts` (pure) replaces it. `GET /api/grocery` adds
  `deal` to every line (`lineDeals`): from the line's saved product (`productFor`), its newest
  night **within `FRESH_NIGHTS` (3), the Deals board's own rule**, its weeks (`readWeeksSince`) and
  the active staged coupons (`readCoupons`), through `productSignal` (`lib/dealSignal.ts`), **the
  same function `buildDealBoard` calls**, so a line's shade and the board's colour cannot differ.
  `deal` is `{shade, reason, salePrice, coupon, best, bestNights}` or `null` (no saved product, no
  night that fresh, no price: plain, no bubble). **Shade**: green is good, red is bad, else plain;
  `new` (under `MIN_WEEKS`) is good when on sale or with a coupon, never bad (`shadeOf`). The bubble
  is "Sale $2.99" (night's sale below regular), "Coupon" (a staged coupon lists the code, matched
  by code only; none staged today so only sales show), or "Sale + coupon". Colour is never the
  only cue: a bubble, or "● Good price" / "● High price" (shortened to Good / High beside a
  bubble, with the full words as `title`/`aria-label`). A failed weeks/coupons read comes back as
  `dealError`, said in the header, and lines stay plain; prices are unaffected. Ticked lines are
  not shaded. The row is one line: name `truncate`, small line `truncate` with `overflow-hidden`,
  the mark, bubble, word, price, ×N and buttons `shrink-0`; the row's `title` is the whole text.
  Shading is a 4px left edge plus an 8% wash (`SHADE_CLASS` in `app/List.tsx`; local pattern, the
  Deals row's edge and tints); `tests/dealShade.test.ts` holds ink, soft ink and the tint at 4.5:1
  on it, Clark light and dark, over paper, surface and raised.
- **Best** (`lib/bestPrice.ts`, pure, `BEST_WITHIN` 0.05, `BEST_MIN_NIGHTS` 2): tonight's effective
  price at or within 5% of the lowest night in the 12 weeks to today (day 84 back counts), needing
  at least 2 priced nights. Deals' Best button (fifth in the Show group; `DealRow.best`, board
  `nightsHeld`) and the List's **Best** toggle (`aria-pressed`, filters `i.deal?.best`) both read
  it. Empty states: Deals `bestEmpty` and the List's `bestEmptyWords` say "needs at least 2 nights"
  or "nothing is at its low". Until a 2nd night exists nothing is Best. The Deals board now reads
  12 weeks of nights (was 3) for it.
- Picking a store does not start a scan; the old store's scan tags nothing until the next scan.
- `Cart.tsx` runs every token-borrowing request through `serial`, one at a time: any page load can
  start a refresh and a scan together. The Pickup/Delivery switch (`ModeSwitch`), the List and In
  cart rows and the price text are local patterns in `app/List.tsx`.

## Deals (TEC-132)

- **Nightly scan.** `vercel.json` has the cron `0 9 * * *` on `/api/cron/prices`: 09:00 UTC, which
  is **03:00 Denver in daylight time and 02:00 in standard**, always the same Denver date. A
  *night* is that Denver date (`denverDate`, `lib/priceDates.ts`). The route is GET only (what
  Vercel Cron sends, with `Authorization: Bearer <CRON_SECRET>`); `lib/priceRun.ts` does the work.
  It reads the connection row for the **store only** and signs in with Kroger's client-credentials
  token (`appToken`, scope `product.compact`; needs `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`,
  not `KROGER_TOKEN_KEY`). Every saved code goes to `productsByIds` (fifty a request); a product
  Kroger does not return, or returns with no price, gets **no row** (a gap, counted in the body).
  A Kroger failure writes nothing and answers 502, so Vercel shows the run failed. The body is the
  night, the store's name, counts and the weeks rolled up; no token or secret.
- **Rerun the same night is a no-op**: the first reading stands, and the body says
  `alreadyRecorded`. A missed night is never backfilled.
- **Roll-up** (`rollUpWeek`): every run rolls up each finished Monday-to-Sunday week, looking back
  `CATCH_UP_WEEKS` (12), that has nightly rows and no `price_weeks` row at all (`readRolledWeeks`,
  one read; the check is per week, not per product). Normally that is the week that ended
  yesterday; **a missed Monday is caught up on the next run** from the nights that exist, and a
  missed night stays a gap (owner, 2026-10-24). Idempotent (insert ignores a conflict, and a
  rolled week is skipped). It runs even when Kroger failed. The current week is never rolled up. A
  week with no nights makes no row and is looked at again until it ages out of the look-back.
- **The gate carries the one exception**: `proxy.ts` (every app, byte-identical) lets exactly
  `/api/cron/prices` through without a session only with the bearer secret, refuses when
  `CRON_SECRET` is unset or under 32 characters, and 401s everything else on that path, a session
  cookie included. The route checks again (`lib/cronAuth.ts`). `tests/gate.test.ts` is the same file
  in every app.
- **The stoplight** is `stoplight` (`lib/stoplight.ts`), one pure function: today's effective
  price (sale if present, else regular) against the product's last 12 weeks of `price_weeks` at the
  chosen store. Named constants `GREEN_UNDER_MEAN` (0.15), `RED_OVER_MEAN` (0.10), `MIN_WEEKS` (4),
  `HISTORY_WEEKS` (12); TEC-138 reviews them. The mean is over nights (each week weighs its
  `nights_seen`); the low is the lowest weekly low. Under four weeks is `new: building history`
  with no colour. The note says the weeks it has ("at its 8-week low").
- **The board** (`GET /api/deals`, `lib/dealBoard.ts` reads, `lib/dealRows.ts` builds): every saved
  product whose latest night is within three nights of today at the chosen store. A product with
  no fresh night, at any time, is filled in from the list tab's latest deal scan when that scan
  (same store, within three days) found it on sale, its colour from whatever weeks it has;
  otherwise it is counted as unpriced, never shown. No Kroger call.
  `lib/dealFilter.ts` is the browser's half (search, All / On sale / Coupon / Stacks, Any / Green /
  Neutral / Red / New, aisle); a **new** product shows under Any and under New, none of the three colours. A coupon
  matches by product code only. Coupon and Stacks say "no coupons staged yet" until a coupon row
  exists.
- **Last price check and empty filters** (TEC-190). The board carries `lastRun` (first and last
  night at the store and when the last night was written, `readNightSpan`) and `weeksHeld` (the
  most weeks any priced product has). The tab says "Last price check: Wed Oct 28, 9:04 AM · prices
  since Oct 27" (the cron's first insert, in the browser's time zone; the night's date when
  `recorded_at` is missing). **`emptyMessage`** (`lib/dealFilter.ts`, pure) gives every empty
  filter its own words: Green, Neutral and Red with under `MIN_WEEKS` weeks say colours start after
  4 weeks of prices, **about `coloursFrom(asOf, weeksHeld)`** (the Monday run that rolls up the
  missing week: from Thu Oct 29 with none, Nov 23; a Monday counts that day's run as done), and
  offer **Show New instead**, which is `set({ light: "new" })`, the New button's own filter state.
  Other empties: no store, coupons not staged, no prices yet, no recent prices, nothing new,
  nothing on sale, and "No deals match" only as the last resort. **The filters were never broken**:
  on 2026-10-29 `price_nights` held two nights (Oct 27, 28; 389 products) and `price_weeks` was
  empty, so the stoplight had 0 of the 4 weeks it needs and every row is correctly New;
  `tests/dealFilter.test.ts` builds that board and holds it.
- **On my list** (TEC-132, owner 2026-10-26) is the first section of the tab, above the filters
  and not affected by them. `lib/listDeals.ts` (pure) takes the board's rows and the list's open
  (unticked) lines; `List.tsx` hands the lines up through `onOpenLines` and `Cookbook.tsx` passes
  them down, so it is the one read of the list and **no request of its own**. A line finds a row the
  way the list finds products (`decide`): a product code; else a saved name as whole words, the
  longest winning; only if none, the line's item words in the official name. A **deal** is a sale,
  a staged coupon or a green light; a matched row that is none of those is not listed. Each row
  says which line found it. Empty: "Nothing on your list has a deal right now." (and "Reading your
  list…" until the list is read). The edge: `decide` weighs every saved product, this only the board
  (products with a recent price), so a longer name on an unpriced product cannot outrank a
  shorter one here. The rows also stay in their aisle below.
- The tab's rows, chips, colour mark and trend bars are local patterns in `app/DealsTab.tsx`; the
  trend is the last eight weekly means with today as the last bar.

## Your brands (TEC-131)

- The tab (`app/Brands.tsx`, TEC-135 look): the count and when last checked, **Refresh now** (the
  list's refresh, through `serialKroger`), a search over names, Kroger's name and code, and the
  filters **All · Pick a default · Fix these · N**. **Fix these · shrank, discontinued or seeded
  wrong** (`fixThese`, `lib/brandGroups.ts`): size drift (shrank / grew / changed size), a product
  Kroger no longer returns (**Replace** when a successor was found, else edit), and rows whose note
  starts `check:`. Then **groups** (`brandGroups`): products joined through any shared name
  (union-find), titled by the shared name most carry, the default first and starred, "bought N×",
  *when the line says "…"* (`namingHint`: up to two words of its Kroger name no other member is
  known by) and **Make default** on the others. Make default posts `POST /api/brands/default`
  with every shared name that product carries. A lone product is its own group and its own
  default. Footer: Remember a product · Paste a batch · Export · Search words. The cards, rows,
  Fix these panel and the filter are local patterns.
- Routes: `GET/POST/DELETE /api/brands` (POST a product: `names` as one comma-separated field or a
  list, `product` as a page or code, optional `size_first`, `pack_*`; `id` to edit, whose names are
  then the whole list; without `id` a saved code gets the names added. `kind: "terms"` for search
  words). `/api/preferences` is gone.
- Drift text: `lib/sizeDrift.ts`, "was 12 oz, now 10 oz — $3.49 is $0.349/oz now, $0.291/oz at
  12 oz": both per-unit figures at today's price (no first price is stored), base units oz, fl oz
  or each; a size that does not parse shows as words only.

## Paste a batch format (TEC-131)

One format in and out: Export writes it, Paste a batch reads it, and the TD's seed is written in
it. Parsed by `readBatch` (`lib/brandBatch.ts`); change both together. A batch is a **JSON
array**; each element is a product row or a search-word row.

| Field | Row | Meaning |
|---|---|---|
| `product` | product, required | The code **as a string**, 8–14 digits (a JSON number loses leading zeros and is refused). A King Soopers product page is read for its code. |
| `names` | product, required | A list of every way a list line may say it, each matched as whole words. Trimmed, spaces collapsed, repeats dropped ignoring case. |
| `count` | product | Whole number ≥ 0, **absolute, not an increment**. Left out: 0 on a new row, unchanged on a saved one. |
| `size_first` | product | The size first bought. Never overwrites a saved one. |
| `pack_label` | product | The shopping unit the list shows, "Heads of Garlic". |
| `pack_size`, `pack_unit` | product, together | One pack holds `pack_size` of the recipe unit `pack_unit`: `10`, `"cloves"`. A unit the app does not know ("eggs") counts plain numbers. |
| `brand`, `note` | either | Text kept on the row. |
| `phrase`, `terms` | search words, both required | A phrase and the words to search instead. No `count`. |
| `kind` | search words | Optional; `"plain"` is refused by name. |
| `replace` | either | `true` only on a row the review ticked over a saved one. A producer never sets it. |

```json
[
  { "product": "0001111000001", "names": ["test cola", "test cola zero", "12 pack test cola"], "count": 6,
    "size_first": "12 pk / 12 fl oz" },
  { "product": "0001111000002", "names": ["test garlic"], "count": 3,
    "pack_label": "Heads of Garlic", "pack_size": 10, "pack_unit": "cloves" },
  { "phrase": "test rice", "terms": "long grain test rice" }
]
```

- **The review** (`POST /api/brands/preview`, writes nothing) shows one line per row: `new`,
  `updates` (a saved code: ticking adds the batch's names to the saved ones, sets its count, fills
  an empty size first bought, and sets any pack fields sent; what changes is listed), `already`
  (nothing would change), `replaces` (a saved phrase with other words) or `refused` with the reason
  (bad field, `plain`, a code or phrase twice in the batch). New rows start ticked; the rest start
  unticked. **Write** posts the ticked rows' `send` to `POST /api/brands/import`, which refuses any
  row that would change a saved one unless it carries `replace: true`, and names every refusal.
- **Export** (`GET /api/brands/export`) downloads `cookbook-brands-<date>.json`: products by first
  name, then phrases; counts always present. Pasted back, every row reviews as `already`; an old
  `plain` row exports as `"kind": "plain"` and is refused by name on the way back in.

## List lines (TEC-131)

- **The tab** (TEC-135): the header (**N still to buy** · about $N · the store, and Pickup/Delivery),
  an add box that looks one line high and grows to show a paste: **one item per line**
  (`typedLines`, `lib/typedLines.ts`; owner, 2026-10-23, "Keep multi-line paste"; Enter adds,
  Shift+Enter starts a line; "notes after a dash"), **Cooking this week** (the menu as day and
  recipe chips with a two-tap Clear; names come from the book via `Cookbook.tsx`; moving a day
  stays on the book's *On the menu*), then **List · N** (Copy · Tidy · Clear ticked · Clear all, the
  lines, the legend, **Send all to cart**), **In cart · N** (Remove per line, Clear cart, Go to
  checkout, the caveat) and the King Soopers panel (TEC-190; the sticky bar left). The header says
  "N still to buy · N in cart · store · prices from the night of …". Each List row is the tick,
  the name over a small line (★ ? + mark, bubble, recipes, amount, note), the price over the ×N
  box, and **+ Cart** (32px, 12px bold, accessible name "Add to cart"; `h-8`, not the 44px floor,
  by the owner's word).
- **Each line's mark** (`lineMark`, `lib/brands.ts`; `GET /api/grocery` adds `mark`): ★ goes in
  as a saved product (code, only product, default, or named), ? needs a pick at Send, + anything
  else, including a product found only by its Kroger name and a typed code that is not saved.
- **Shown as what you buy** (`lib/lineView.ts`, display only; `GET /api/grocery` adds `view` to
  each line): `[ ] <name> — <recipes> · <amount> · <note>   ×<quantity>`, the name full size and
  the rest small. The name is the decided product's `pack_label` (the top candidate when several
  match), else `itemWords` of the line after its leading amount, capitalised. The amount is the
  leading amount of the name plus a note made only of amounts (what Tidy writes, "1/4 tsp and 1/2
  tsp"): same units add, tsp/tbsp/cup/fl oz/pt/qt, oz/lb, g/kg and ml/l combine into the smallest
  unit present, other units are joined with " + ". Fractions stay fractions ("1 1/2 cups"). A note
  that is not only amounts shows as written. "12 pack …", "6 ct …" are names, not amounts.
- **Bulk produce as bags** (TEC-190, `bagOf` / `readAs` in `lib/lineView.ts`): a plain count (no
  unit; the name's and a Tidy note's amounts added) of onions or potatoes over 3, carrots or lemons
  or limes over 4, with at most the listed colour words in front (onions: yellow, white, red,
  sweet, spanish; potatoes: russet, red, yellow, gold, golden, white, yukon, baking, idaho, new;
  none for the rest), becomes one bag: onions 3 lb, potatoes 5 lb, carrots 2 lb, lemons 2 lb
  (that weight is the owner's mockup, not his words), limes "bag" (no weight was given and none is
  invented). The view is "Onions, 3 lb bag" with "was 5 onions", quantity 1. **The same phrase is
  how the line is decided, searched, linked and remembered**: `decider(name, note)` decides
  `onions 3 lb bag`, `lineTerm(name, note)` searches it (so `itemWords` never drops the bag), and
  the remembered name is the phrase, never the count. **Only a product that is itself a bag can
  decide it** (a name that mentions the size, or "bag" as a word in its Kroger name); a saved
  loose "onions" never does, or five onions would go in as one. A saved product with a pack label
  or size decides the quantity instead and the rule steps aside. `decide`, `lineTerm`, `linkFor`,
  `targetFor`, `scanEntries` and `quantityRule` now take the line's note as well as its name.
- **The cart quantity is set when a line is written**, by the same rules (`quantityRule`,
  `lib/lineQuantity.ts`): typed lines (`POST /api/grocery`), recipe lines (`toGroceryList`) and a
  Tidy (`applyTidy`, the larger of carried and computed). With the product's pack conversion:
  the amount in packs, rounded up (14 cloves at 10 a head → 2; a same-family unit converts).
  Without: a typed count or a count of packs ("2 onions", "3 bunches cilantro") is the quantity;
  a measure (tsp, cup, clove) is 1. The ×N box still edits it, and the cart sends the stored
  quantity. If Your brands cannot be read at write time, the rules run without conversions.

## Errors

One status per failure, in `lib/errors.ts`, via `lib/respond.ts`: `LookupError` 503 (database did
not answer), `InputError` 400, `ConflictError` 409, `UpstreamError` 502 (Kroger; `reconnect: true`
when the stored sign-in failed), `SetupError` 501 (missing variable), anything else 500.

## Traps

- **In cart is what Cookbook sent, not the account** (TEC-190). Anything added in the King Soopers
  app, and anything bought since, is invisible; a line cleared from the list while in the cart
  loses its ledger link (`item_id` null) and is never taken back, so Clear all and Clear ticked
  leave In cart lines alone. A line the owner removes in the King Soopers app still shows In cart
  until Remove or Clear cart (which Kroger may refuse or ignore; negative quantities stay
  unconfirmed).
- **A bag line saved as a product is saved under its phrase** ("onions 3 lb bag"), so a bag picked
  for "5 onions" also catches "7 onions" and "8 yellow onions", and never "2 onions".
- **Deals colours start at 4 weeks of rolled-up weeks, not 4 weeks of nights**: the Monday run
  rolls a finished week, so the first colour is the run after the fourth Sunday. A missed Monday
  that has nights is caught up on the next run; a week with no nights never rolls up and pushes
  the date out, which `coloursFrom` cannot know.

- **"Invalid API key" comes from Supabase.** Only drafting, an ingredient edit and Tidy call a
  model.
- Health reads a 503, or a `SESSION_SECRET` mismatch, as "couldn't reach the Cookbook".
- `tests/servings.test.ts` holds the contract's exact fields; metadata never enters it.
- **`/list` is depended on by Health's redirect** (`tests/tabs.test.ts`); renaming it is cross-app.
- **Client components import only pure libs.** The helpers they run sit apart from the modules that
  import `./supabase`: `perServing` and `methodSteps` in `lib/recipeSteps.ts`, `MAX_QUANTITY` and
  `asText` in `lib/groceryText.ts`. `lib/recipes.ts` and `lib/grocery.ts` re-export them, so the
  routes and tests read them from there as before; a client component takes them from the pure
  file and takes only *types* from the other. Keep it so: a client import of a module that imports
  `./supabase` pulls the client into the browser bundle, where it is safe only because the service
  key is not `NEXT_PUBLIC_` and is read inside `getServiceClient`; never read it at module top level.
- Empty-vs-unread is in `DECISIONS.md`. `lint` is unconfigured.
- Read Vercel and Supabase live before writing a deployment step.
- **`api.kroger.com` is reachable from a session; `developer.kroger.com` and `kingsoopers.com`
  are not.** A session holds a Kroger key only when the environment sets `KROGER_TEST_*`.
  Confirmed live on the test app (2026-10-20): Basic auth on `/token` (the app token lasts 30
  minutes), `filter.chain=KINGSOOPERS`, `filter.productId` with several comma-separated IDs,
  `price.regular` plus `price.promo` with its start and end dates, `inventory.stockLevel`, the
  aisle, fulfilment flags (pickup, delivery, in store, ship) and the product page link. Price,
  stock and fulfilment come back empty without `filter.locationId`. `filter.term` needs at least 3
  characters; search pages hold at most 50 and stop at 1,000 results. No rate-limit headers. The
  public API has no coupons, offers, orders or lists (404). An app token gets 403 `AUTH-1007` on
  `PUT /cart/add`, so the cart needs the user's sign-in; its body (`{items:[{upc,quantity}]}`,
  with or without `modality`) is unconfirmed until the first production Send. **A negative
  `quantity` on `/cart/add` is unconfirmed too** (Take back rests on it): untested until the first
  production Take back. A refusal is handled (the line fails, stays sent, the cart page is
  offered). A 2xx that Kroger ignores, or treats as a positive add, would not be noticed here
  (TEC-162).
- The code reads every table and column the `cookbook_*` migrations add, so a database missing one
  fails those reads; without `cart_sends`, a Tidy fails before deleting and leaves the list
  duplicated.
- Lines sent before `cookbook_cart_sends` have no ledger rows; Take back skips them and says so.
- **Changing `KROGER_TOKEN_KEY` orphans the token**; the list asks to connect again. That is the
  rotation path.
- Two concurrent refreshes can race token rotation; the second fails with `reconnect`.
- A remembered match or replacement's name is the line's whole name (less any note), so "2 cups
  whole milk 2%" is added as that name, not "milk"; edit the names in Your brands. Tapping a poor
  top match saves it too: untick it or paste a page instead, or fix it in Your brands.
- A product name equal to a search-word phrase: the product wins, and the phrase row is dead
  until one of them is renamed or forgotten.
- Matching by official name only runs when no saved name matched, and only after a refresh has
  filled `description`; a freshly pasted seed matches by names only until **Refresh now**. Since
  TEC-135 Send offers such a match only when Kroger's top `CHECK_RESULTS` for the item include
  its code, so a real match that Kroger ranks lower falls to Not saved yet; tap the right product
  (it is remembered) or add the name in Your brands.
- A Pick one pick is remembered, so the line's whole name joins that product's names; the next
  time that exact line has one match and goes straight in, whatever the default.
- The list's link and price for a line decided by default follow the default; changing the
  default in Your brands changes them on the next read.
- Your brands' groups chain through shared names, so one broad name ("milk") can pull unrelated
  products into one card. Make default sets only the shared names that product carries; when it
  does not carry the card's title name, the card still reads as needing a default.
- A bare code becomes `/p/<first-name-slug>/<code>`, unconfirmed as a page King Soopers serves
  (kingsoopers.com is unreachable from here). Send reads only the digits; the refresh replaces it
  with Kroger's own page. Run **Refresh now** after pasting a seed.
- Lines already on the list before this shipped keep their stored quantity (1); the rules apply to
  lines written after. A pack conversion added later does not change lines already on the list.
- A Tidy can raise a quantity lowered by hand, when the merged line's rule says more.
- Preview and local deployments cannot complete Kroger sign-in; the redirect URI is production's.
- A list line's bubble and shade need a saved product and a night within 3 days at the chosen
  store (the Deals board's rule); a line with none is plain, which is right but can read as "no
  deal". A product the board shows only from the weekly scan (no fresh night) is plain on the list.
  Nothing is Best until a product has 2 nights; before ~Nov 23 nothing is red or green by history,
  only sale or coupon is good.
- `withAccessToken` is per request: two tabs open at once can still race token rotation, because
  `serial` covers one page.
- **`CRON_SECRET` must be set in `tp-cookbook` (32+ characters)**: unset or short, the gate and the
  route both refuse, and Vercel Cron's call is a 401 every night. Nothing else breaks, so it is easy
  to miss; the first Deals tab is simply empty. `.env.example` says how to make one, and
  `/api/health` has a `cronSecret` check (set and 32+ characters, never the value), so a missing
  or short secret turns the whole probe 503. `tests/cronSession.test.ts` holds that a valid session
  cookie is refused on the path without the bearer (`tests/gate.test.ts` is byte-identical in every
  app, so that half lives in its own file).
- **Disconnect (`DELETE /api/kroger`) deletes the connection row, and the chosen store with it.**
  Until King Soopers is connected and a store picked again, every nightly price run answers 409
  "Pick a store first" (`lib/priceRun.ts`), and those nights stay gaps forever. Missing
  `KROGER_CLIENT_ID` or `KROGER_CLIENT_SECRET` makes the run a 501 (`appToken`).
- **A product whose price never moves reads neutral**: green needs it below its mean as well as at
  its low (owner's amendment, 2026-10-24).
- Vercel Cron does not retry a failed run, and it may fire anywhere inside its hour on some plans:
  09:00 UTC stays on the same Denver date either way. The Denver clock change moves the run between
  03:00 and 02:00 local, not the night.
- Kroger sends categories as a list; the aisle is the first. A product with none is under "Other".
- The cron route must stay GET and must stay out of any other gate exception; adding a second path
  to the gate is shared auth plumbing (owner approval).
