# Cookbook — notes

What is true now, and its traps. Rules are in `RULES.md`; open work is in Linear.

## Shape

- Next 16, React 19. Gate: `proxy.ts`, Node runtime, base copy; `drift` fails a `middleware.ts`.
- Tabs in `app/Shell.tsx`: `/` Recipes, `/add` (`AddRecipe.tsx`), `/list` (signed out, it
  round-trips `/login?from=/list`). Results are toasts; a failed read stays inline.
- Install icon: `app/apple-touch-icon.png` (No. 12, full-bleed) with `appleWebApp` metadata; its
  colours are fixed in dark mode too.
- No GET route is cached; caching would serve Health stale servings.
- Model requests come from `requestShape` in `lib/models.ts` (the third copy of Coffee's registry).
  Haiku 4.5 gets no effort parameter; it returns 400. Tool-less calls send a JSON schema; every call
  checks `stop_reason`.

## Recipes

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
  it. Tidy (Haiku, checked by `validateTidy`) unions names, takes the largest quantity and the latest
  `sent_at`. "Milk — the small tin" is a name and a note; only the name is searched.
- `brand_preferences`: unseeded until the owner pastes the seed (TEC-51 step 6). Edited only in
  Your brands; **Paste** takes King Soopers product pages only. `plain` is refused on write but
  honoured on old rows. A field not sent is not overwritten. `brand` is kept from a batch, never
  shown. **A phrase holds several product rows** (unique on phrase and `url`) or one search-word
  row, never both; `placeDraft` (`lib/preferences.ts`) is the one rule for where a write lands, and
  compares product numbers, not URLs. `tally` is the count (`cookbook_brand_tally`): 0 by default,
  set only by a batch, +1 per Send add on **every** product row whose page carries that number
  (`tallyBumps`), so a product saved under two phrases counts on both. Take back does not lower
  it. The editor neither shows nor sets it, and edits by `id`.
- `menu`: one row per recipe with a `day`, set only beside *Add to list*; re-adding moves it.
  Shown per serving. Nothing expires; ✕ or Clear all.
- `kroger_connection`: one row (`id` can only be true), the refresh token sealed with AES-256-GCM
  (refused without `v1:`), the store, `refreshed_at`, `modality` (PICKUP or DELIVERY, default
  PICKUP; a disconnect deletes the row and the choice with it).
- `brand_products`: price, stock, page, `checked_at`, `missing_since` (shown in Your brands and on
  its collapsed toggle).
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
- `GET /api/kroger/cart` is the review: an exact product's UPC is its URL's digits
  (`productIdFromUrl`).
- **Three sections** (TEC-51): `matchCandidates` returns the longest matching phrase's rows
  (products only when it has any), most counted then most recently updated. `planLine` makes one
  product number `exact`, several `settle` (`options`, deduped by number; a page without one is
  dropped), none a Kroger search (`match` / `none`). The estimate and the deal scan price the top
  candidate. **Tapping Send to cart** runs the review, then `Cart.tsx` POSTs every `exact` line
  with no `sent_at` at once (reported as *Straight in from Your brands*); the rest show as
  *Matched in Your brands* (already sent, or not taken in), *Settle these* (chips, nothing
  preselected) and *No match*. If that first POST fails or 409s, those lines join the review
  ticked. Each result block shows only its own lines; the server's `summary` still counts every
  open line. A Settle these pick sends `upc` plus `match` (its page), so it is remembered like a
  match: under the line's name, which is a no-op when that is the phrase itself. The chips and
  section headings are local patterns in `app/Cart.tsx`.
- After `markSent`, the route calls `bumpTallies` with every added UPC (read, then update each row;
  `updated_at` untouched). A failure joins `recordError`; the items stay in the cart.
- **Remembering** (TEC-128): whatever goes in for a non-exact line, a pasted page or the tapped top
  match, is saved by `savePreference` as a `product` row under the line's name (`splitLine`, so
  never the note). The client sends the match's page as `match` beside its `upc`; an exact brand
  sends none and is never re-saved. Only after that line's add succeeded (including the retry
  without Pickup/Delivery); a failed add saves nothing. A page whose digits are not the UPC that
  went in is not saved. A failed save is appended to the line's detail; the line stays added.
  The same phrase and product number updates that row; a phrase saved as search words is
  overwritten by the product; otherwise it is a new row beside the phrase's other products.
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
  Search-word brands are counted, not checked. `refreshed_at` moves only when brands were checked.

## Prices (TEC-121)

- Pure logic in `lib/pricing.ts`, wired in `lib/dealRun.ts`; `lib/decide.ts` is the one brand
  decider for the review, the estimate and the scan, so a line is priced as what Send would add.
  Exact IDs go in one `productsByIds` call (50 per request); searches run four at a time.
- Deal scan: `GET`/`POST /api/kroger/deals`. Every saved brand plus every open line; a deal is
  `promo < regular`, sorted by percent off, then dollars. Runs when the list opens and the latest
  scan is over seven days old (`scanDue`), or on *Scan for deals*. A scan that throws saves
  nothing, so the next open retries.
- Coupons are never read. *Find coupons* is `couponsUrl` (`lib/kingsoopers.ts`), a constant.
- Estimate: `POST /api/kroger/estimate`, computed and not stored. Promo first, in cents. A line not
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

## Paste a batch format (TEC-51)

One format in and out: Export writes it, Paste a batch reads it, and a TD helper or the weekly
Chrome task (TEC-126) produces it. Parsed by `readBatch` (`lib/brandBatch.ts`); change both
together. A batch is a **JSON array**; each element is one phrase:

| Field | Required | Meaning |
|---|---|---|
| `phrase` | yes | Text that must appear, as whole words, in a list line. Trimmed, spaces collapsed; compared case-insensitively. |
| `product` | one of `product` / `terms` | A King Soopers product page `https://www.kingsoopers.com/p/<slug>/<digits>` (or `kingsoopers.com`), **or** the bare product number, 8–14 digits, as a string (a JSON number loses leading zeros). A bare number is stored as `https://www.kingsoopers.com/p/<phrase-slug>/<digits>`. `url` is accepted as the older name. |
| `terms` | one of `product` / `terms` | Search words instead of a product. No `count`, no `alternatives`. |
| `count` | no | Whole number ≥ 0: the product's count, **absolute, not an increment**. Left out: 0 on a new row, unchanged on a ticked existing one. |
| `alternatives` | no | Array of `{ "product": …, "count": …, "brand"?: …, "note"?: … }`: other products for the same phrase (sizes, flavours). Each becomes its own row; Settle these offers them all. |
| `brand`, `note` | no | Text kept on the row (an alternative carries its own). |
| `kind` | no | `"product"` or `"terms"`; inferred from the fields. `"plain"` is refused. |
| `replace` | no | `true` only on a row the review ticked over a saved one. A producer never sets it. |

```json
[
  { "phrase": "test cereal", "product": "0001111000001", "count": 6,
    "alternatives": [
      { "product": "https://www.kingsoopers.com/p/test-cereal-family/0001111000003", "count": 2 }
    ] },
  { "phrase": "test rice", "terms": "long grain test rice" }
]
```

- **The review** (`POST /api/preferences/preview`, writes nothing) shows one line per product:
  `new`, `adds` (another choice beside N saved), `already` (same phrase and product number, or same
  words), `replaces` (overwrites the phrase's search-word row, or its one product with words), or
  `refused` with the reason (bad field, `plain`, twice in the batch, words for a phrase holding
  several products). New and adds start ticked; already and replaces start unticked and show
  what is saved now. **Write** posts the ticked lines' `send` rows to `POST /api/preferences`,
  which refuses any row that would change a saved one unless it carries `replace: true`.
- **Export** (`GET /api/preferences/export`) downloads `cookbook-brands-<date>.json`: phrases
  alphabetical, the most counted product as `product`, the rest as `alternatives`, counts always
  present. Pasted back, every line reviews as `already`; a `plain` row exports as
  `"kind": "plain"` and is refused by name on the way back in.

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
- A remembered match or replacement's phrase is the line's whole name (less any note), so "whole
  milk 2%" saves under that, not "milk"; shorten it in Your brands. Tapping a poor top match saves
  it too: untick it or paste a page instead, or fix it in Your brands.
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
- **`cookbook_brand_tally` must be applied before this code runs**: `readPreferences` selects
  `tally`, so without it the list's links, Your brands, Send to cart, the estimate, the deal scan
  and the refresh all fail to read. It also swaps the one-row-per-phrase index for two partial
  ones; undoing that fails once a phrase holds two products.
- **A bare product number becomes `/p/<phrase-slug>/<digits>`, unconfirmed** as a page King Soopers
  serves (kingsoopers.com is unreachable from here). Send reads only the digits, so the cart is
  unaffected; the refresh stores Kroger's own page in `brand_products.url`, which the review links
  when present. Run **Refresh now** after pasting a seed.
- The weekly task (TEC-126) has to send absolute counts; to add to one, it needs the current
  count from an Export.
- Never revive a merged `claude/cookbook-*` branch.
