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

Six; reasoning is in the migration headers.

- `recipes`: `macro_source` has no `web`; a unique index refuses a duplicate name.
- `grocery_items`: `quantity` 1–99; `recipes` is a snapshot of names, so a rename never reaches
  it. Tidy (Haiku, checked by `validateTidy`) unions names, takes the largest quantity and the latest
  `sent_at`. "Milk — the small tin" is a name and a note; only the name is searched.
- `brand_preferences`: unseeded (TEC-51). Edited only in Your brands; **Paste** takes King Soopers
  product pages only. `plain` is refused on write but honoured on old rows. A field not sent is
  not overwritten. The `brand` column is unused.
- `menu`: one row per recipe with a `day`, set only beside *Add to list*; re-adding moves it.
  Shown per serving. Nothing expires; ✕ or Clear all.
- `kroger_connection`: one row (`id` can only be true), the refresh token sealed with AES-256-GCM
  (refused without `v1:`), the store, `refreshed_at`.
- `brand_products`: price, stock, page, `checked_at`, `missing_since` (shown in Your brands and on
  its collapsed toggle).

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
  (`productIdFromUrl`); a pasted page is remembered by `savePreference` under the line's name.
- A send re-picking a line with `sent_at` returns 409 before Kroger is called, unless `again`.
- Refresh: `lib/refresh.ts`, `POST /api/kroger/refresh`, triggered by `lib/refreshDue.ts`. No cron.
  Search-word brands are counted, not checked. `refreshed_at` moves only when brands were checked.

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
- **Kroger's API was never reached from here** (egress refuses it). Confirmed by search only: base
  URL, OAuth paths, scopes, `filter.term` (3 characters to 8 words), `filter.locationId`,
  8-character location IDs, `filter.zipCode.near`. Unconfirmed: Basic auth on `/token`,
  `PUT /cart/add` with `{items:[{upc,quantity}]}` and no `modality`, `filter.chain=KINGSOOPERS`,
  `productPageURI`, `inventory.stockLevel`, single-product `filter.productId`. Each is one constant
  or parser in `lib/kroger.ts`; the first production Connect is the first real check.
- **Changing `KROGER_TOKEN_KEY` orphans the token**; the list asks to connect again. That is the
  rotation path.
- Two concurrent refreshes can race token rotation; the second fails with `reconnect`.
- A remembered replacement's phrase is the line's whole name; shorten it in Your brands.
- Preview and local deployments cannot complete Kroger sign-in; the redirect URI is production's.
- The two Kroger migrations must be applied before this code runs.
- Never revive a merged `claude/cookbook-*` branch.
