# Cookbook — notes

What is true now, and its traps. Rules are in `RULES.md`; open work is in Linear.

## Shape

- Next 16, React 19. Gate: `proxy.ts`, Node runtime, base copy; `drift` fails a `middleware.ts`.
- Tabs in `lib/tabs.ts`, rendered by `app/Cookbook.tsx` as one scrolling row of pills: `/`
  Recipes, `/add` (`AddRecipe.tsx`), `/list` (signed out, it round-trips `/login?from=/list`),
  `/brands` Your brands (`Brands.tsx`, TEC-131). All panels stay mounted; a send or refresh on the
  list bumps Your brands, and an edit in Your brands reloads the list. Results are toasts; a failed
  read stays inline.
- **The look is the owner's mockup of 2026-10-23** (TEC-135; the canvas is linked from TEC-135):
  bold headings with a one-line count under them, cards on `bg-surface` with no border, segmented
  switches on `bg-raised`, uppercase section headings, sticky action bars at the bottom. Theme
  tokens only; the mock's peach and green stood in for the livery. Deals (TEC-132) is not built.
- Install icon: `app/apple-touch-icon.png` (No. 12, full-bleed) with `appleWebApp` metadata; its
  colours are fixed in dark mode too.
- No GET route is cached; caching would serve Health stale servings.
- Model requests come from `requestShape` in `lib/models.ts` (the third copy of Coffee's registry).
  Haiku 4.5 gets no effort parameter; it returns 400. Tool-less calls send a JSON schema; every call
  checks `stop_reason`.

## Recipes

- **Add's order is Ask Claude · Link · File · Type it, and it opens on Ask Claude** (TEC-135,
  `MODES` in `AddRecipe.tsx`). The modes' behaviour is unchanged.
- Recipes cards (TEC-135): name with rating · time, the facts line, and four macro tiles per
  serving; opening one is unchanged. *On the menu* stays beside the book.
- The typed path runs a name check before its pricing call.
- An import is also refused when no fetch returned a page (`lib/fetchRun.ts`).
- **Something else** re-asks with every turned-down draft and its reason (`lib/reroll.ts`); **Bin
  it** is a turn-down. The pile is browser state, cleared by Keep it or a new ask.
- Ask Claude's pickers (meal, diet, cuisine, time; `lib/tuning.ts`) are requirements. Diet is tagged
  only where the model agrees, else noted. Book filters add High protein (≥30% of kcal, computed);
  an unset field never matches.
- Metadata sits flat on `recipes`, read by `lib/metadata.ts`. `meal` and `diet` are
  check-constrained to `MEALS` and `DIETS`; `readMeta` drops free-of claims and macro tags. The
  rating is read only from this app's forms. Older rows read "not set" until supplied (TEC-52).
- Editing (`lib/edit.ts`) re-prices only changed ingredients, in one call before the one write;
  servings alone re-divides the pot. Card pill: rating and time; meal · main · cuisine when wide.
- `methodSteps` splits only on the next number in a run ("gas mark 4" stays); its tests hold the
  edges.

## Tables (`cookbook`)

Reasoning is in the migration headers.

- `recipes`: `macro_source` has no `web`; a unique index refuses a duplicate name.
- `grocery_items`: `quantity` 1–99; `recipes` is a snapshot of names, so a rename never reaches
  it. Tidy (Haiku, checked by `validateTidy`) unions names, takes the larger of the largest absorbed
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
  the migration and are kept, unread, until the drop pull request; their phrases still hold the
  unique phrase index, so search words on such a phrase are refused with a sentence.
- `menu`: one row per recipe with a `day`, set only beside *Add to list*; re-adding moves it.
  Shown per serving. Nothing expires; ✕ or Clear all.
- `kroger_connection`: one row (`id` can only be true), the refresh token sealed with AES-256-GCM
  (refused without `v1:`), the store, `refreshed_at`, `modality` (PICKUP or DELIVERY, default
  PICKUP; a disconnect deletes the row and the choice with it).
- `brand_products`: no longer read or written (TEC-131); its fields were copied onto `products`.
  Dropped with the old product rows in a later, owner-approved pull request.
- `cart_sends` (TEC-127): the cart ledger, insert only (`lib/cartSends.ts`) except `item_id`,
  which a Tidy moves onto the merged line before deleting the old ones. Signed quantity: `sent`
  and `refused` positive, `taken_back` negative; the sum per line, UPC and modality is what Take
  back removes. `item_id` is set null when a line is cleared, and those rows are never taken back.
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
  (`lib/brands.ts`), one copy for the review, the estimate, the deal scan, the list's links and
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
  bought pre-picked; opens on the first), *Going in* (tap to change), *Not saved yet* (ticked;
  *Paste a product page*), and *Already sent* (unticked; ticking one needs the "add again" box).
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
- The state is `useCart` (`app/Cart.tsx`); `List.tsx` lays out `SendView`, `CartPanel`
  (connection, store, refresh, Take back's confirm, the estimate, deals) and `CartBar` (sticky
  **Send to cart** and **Take back**). `serialKroger` is module-level, so the list and Your
  brands' Refresh now share one Kroger queue.
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
  and confirm are local patterns in `app/Cart.tsx`.
- Refresh: `lib/refresh.ts`, `POST /api/kroger/refresh`, triggered by `lib/refreshDue.ts`. No cron.
  Every saved code in one `productsByIds` (50 per request); a code absent from the answer is
  flagged (`missing_since` kept from the first time) and Kroger is searched by its `description`
  (else its first name), ten results, for the **closest by name** (`closestProduct`: shared words
  over all words, Kroger's order breaking a tie, never a code already saved), stored as
  `successor`; a failed search keeps the old offer. Writes run four at a time. Drift (`sameSize`
  false between `size_first` and the size now; "1 lb" equals "16 oz") is named in the report.
  Search-word phrases are counted, not checked. `refreshed_at` moves only when products were
  checked.
- **Replace with it** (`POST /api/brands/successor`): moves the code, page, description, size and
  price to the successor's; keeps names, count and `size_first` (so a smaller successor shows as
  drift); refused when another row holds the successor's code. Only on the tap.

## Prices (TEC-121)

- Pure logic in `lib/pricing.ts`, wired in `lib/dealRun.ts`; `lib/decide.ts` is the one brand
  decider for the review, the estimate and the scan, so a line is priced as what Send would add
  (its default or named product first). A line decided only by a product's Kroger name is priced
  as Kroger's top match for the item (`targetFor`), because only Send checks that product.
  Exact IDs go in one `productsByIds` call (50 per request); searches run four at a time.
- Deal scan: `GET`/`POST /api/kroger/deals`. Every saved product (by code), every search-word phrase, plus every open line; a deal is
  `promo < regular`, sorted by percent off, then dollars. Runs when the list opens and the latest
  scan is over seven days old (`scanDue`), or on *Scan for deals*. A scan that throws saves
  nothing, so the next open retries.
- Coupons are never read. *Find coupons* is `couponsUrl` (`lib/kingsoopers.ts`), a constant.
- Estimate: `POST /api/kroger/estimate`, computed and not stored. The list header shows "about
  $N" (rounded) from the last one, or *estimate it*. Promo first, in cents. A line not
  offered for the chosen mode, with no price or with no match is unpriced and named; with nothing
  priced, `total` is null and the sentence says there is no estimate.
- Pickup/Delivery: `PATCH /api/kroger`, `lib/modality.ts` (no imports; the browser runs it). Send
  puts `modality` on each `/cart/add` item; a 400 or 422 is retried once without it, the rest of
  that send goes without, and `modalityWarning` says so. Not retried on 401, 403 or an outage.
- On-sale tag on a list line: "On sale, N% off until <date>" (`lib/saleTag.ts`, type-only
  imports). No Kroger call of its own: `Cart.tsx` hands the latest scan and the last estimate up
  through `onSaleSources`. The scan matches open lines by name, case-insensitive, and only when its
  `location_id` is the chosen store; the estimate overrides for the lines it priced. A passed end
  date tags nothing; no end date drops "until". Says sale, never coupon (TEC-126). The chip is a
  local pattern in `app/List.tsx`.
- Picking a store clears the estimate but does not start a scan; the old store's scan stays shown
  under its store name and tags nothing until the next scan.
- `Cart.tsx` runs every token-borrowing request through `serial`, one at a time: opening the list
  can start a refresh and a scan together. The toggle, estimate panel and deal rows are local
  patterns in `app/Deals.tsx`.

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
  a one-line add box ("notes after a dash"; Enter adds), **Cooking this week** (the menu as day and
  recipe chips with a two-tap Clear; names come from the book via `Cookbook.tsx`; moving a day
  stays on the book's *On the menu*), **Still to buy · N** with Copy · Tidy · Clear ticked · Clear
  all, the lines, the legend, the King Soopers panel, then the sticky bar.
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

- **"Invalid API key" comes from Supabase.** Only drafting and Tidy call a model.
- Health reads a 503, or a `SESSION_SECRET` mismatch, as "couldn't reach the Cookbook".
- `tests/servings.test.ts` holds the contract's exact fields; metadata never enters it.
- **`/list` is depended on by Health's redirect** (`tests/tabs.test.ts`); renaming it is cross-app.
- A client component must not import a lib that imports `supabase.ts`.
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
  offered). A 2xx that Kroger ignores, or treats as a positive add, would not be noticed here:
  check the cart page after the first one.
- **`cookbook_cart_sends` must be applied before this code runs**: without it a send can't record
  what went in (the items still go in, and `recordError` says so), Take back fails to read, and
  **Tidy fails before deleting**, which leaves the list duplicated.
- Lines sent before `cookbook_cart_sends` have no ledger rows; Take back skips them and says so.
- **Changing `KROGER_TOKEN_KEY` orphans the token**; the list asks to connect again. That is the
  rotation path.
- Two concurrent refreshes can race token rotation; the second fails with `reconnect`.
- A remembered match or replacement's name is the line's whole name (less any note), so "2 cups
  whole milk 2%" is added as that name, not "milk"; edit the names in Your brands. Tapping a poor
  top match saves it too: untick it or paste a page instead, or fix it in Your brands.
- **`cookbook_products` must be applied before this code runs**: the list's links, Your brands,
  Send to cart, the estimate, the deal scan, the refresh and adding lines (for the quantity) all
  read `products`. Adding lines degrades to no conversions; the others fail to read.
- A product name equal to a search-word phrase: the product wins, and the phrase row is dead
  until one of them is renamed or forgotten.
- Matching by official name only runs when no saved name matched, and only after a refresh has
  filled `description`; a freshly pasted seed matches by names only until **Refresh now**. Since
  TEC-135 Send offers such a match only when Kroger's top `CHECK_RESULTS` for the item include
  its code, so a real match that Kroger ranks lower falls to Not saved yet; tap the right product
  (it is remembered) or add the name in Your brands.
- **`cookbook_product_defaults` must be applied before this code runs**: `readProducts` selects
  `default_for`, so without it every reader of `products` fails (the list's links, Your brands,
  Send, the estimate, the scan, the refresh).
- A Pick one pick is remembered, so the line's whole name joins that product's names; the next
  time that exact line has one match and goes straight in, whatever the default.
- The list's link and the estimate for a line decided by default follow the default; changing the
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
- The two Kroger migrations and `cookbook_deal_scans_and_modality` must be applied before this
  code runs; the connection read selects `modality`, so without it the whole list tab's King
  Soopers panel fails.
- The coupons search's `?query=` parameter is unconfirmed (kingsoopers.com is unreachable from
  here). A wrong one still lands on the coupons page, unsearched; it is one constant.
- A line added since the last scan has no sale tag until the next scan or *Calculate estimated
  total*; a line renamed by Tidy loses its tag the same way.
- `withAccessToken` is per request: two tabs open at once can still race token rotation, because
  `serial` covers one page.
- Never revive a merged `claude/cookbook-*` branch.
