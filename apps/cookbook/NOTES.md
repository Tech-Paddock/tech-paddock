# Cookbook — notes

State as of 2026-10-20, after TEC-90 (Send to cart, King Soopers), on top of #257 (menu days, the Add
tab, the icon), #259 (Surface) and Next 16.

`RULES.md` has the charter. This file is only what is true right now, and its traps. **Open work is
in Linear under `app:cookbook`** — never here.

---

## What is true now

**Surface: installable, and still a site** (charter). Three tabs in `app/Shell.tsx`, each a long page:
**`/` Recipes, `/add` Add (`AddRecipe.tsx`, always open), `/list` the King Soopers list** (TEC-22,
signed out it round-trips `/login?from=/list`). Results are toasts; a failed read stays inline.
**Install is a shortcut, not a change of shape**: No. 12, full-bleed, is `app/apple-touch-icon.png`
with `appleWebApp` metadata; **its colours are fixed, dark mode included.** An app is TEC-109, parked.

**Four ways in** — type it, ask Claude, from a link, from a file. **Nothing a model wrote is saved
until Keep it; the typed path saves straight away**, after a name check that spares it a pricing
call it could not keep. A file is **never stored**. **An import is refused three times**: `read:
false`, no ingredients, or **no fetch that returned a page** (`lib/fetchRun.ts`). **"Something else"**
re-asks with every draft turned down plus a reason (`lib/reroll.ts`); **Bin it is a turn-down too**.
The pile is browser state: Keep it or a new ask (brief or picks) clears it. **Ask Claude's pickers**
(meal, diet, cuisine, time — `lib/tuning.ts`) are requirements, tagged on the draft; **diet only
where the model agrees**, else a note. **The book filters on the same four plus High protein,
computed** (≥30% of kcal), never stored; a detail left unset never matches a filter on it.

**On Next 16 and React 19; the gate is `proxy.ts`** (Node runtime, the base copy — drift fails a
`middleware.ts` here). **No GET route is cached** (TEC-114, measured under `next start`): nothing
opts back in, and a `revalidate`, `force-cache` or `"use cache"` would serve Health stale servings.
**Model requests come from `requestShape` in `lib/models.ts`** (Haiku 4.5 gets no effort — it 400s;
the third copy of Coffee's registry, flagged). The four calls without a tool send a JSON schema;
every call checks `stop_reason`. **`methodSteps` splits only on the next number in a run** — gas
mark 4 stays put (its tests hold the edges).

**Six tables in `cookbook`**, reasoning in the migration headers; the two Kroger ones are below. `recipes` stores **the whole pot**;
`grocery_items` is this app's list; `brand_preferences` is unseeded (TEC-51); `menu` is **On the
menu**: a row per recipe with a **`day`** (the `cookbook_menu_day` migration) picked beside *Add to
list* — the only way on; re-adding moves it — shown per serving. **Nothing expires**: ✕ or Clear
all. **A list line carries its recipes' names** (`grocery_items.recipes`, a snapshot; Tidy unions
them), so an edit or rename never reaches it. **`macro_source` has no `web`**; **a duplicate name is
refused by a unique index.**

**Recipe metadata (TEC-52) sits flat on `recipes`**; **`lib/metadata.ts` reads it** off a model, a
request or a row alike. `meal` and `diet` are check-constrained to `MEALS` and `DIETS`; the rest is
open lowercased text. **No free-of claim or macro tag is storable** (`readMeta` drops them). **The
rating is Joel's**, read only off this app's forms; a model's is discarded. Older rows read "not set"
until Joel sends their values (TEC-52). **Every field of a kept recipe is editable** (`lib/edit.ts`):
only changed ingredients re-price — one call before the one write, so a failure writes nothing;
servings alone re-divides the same pot. Pill: rating and time always; meal · main · cuisine when wide.

**The list leaves three ways: copied text, a King Soopers link, or Send to cart** (TEC-90; Joel
reversed the no-OAuth rule for Kroger only). **A line's name is its link**; the checkbox is a
separate tap target, and **each line has a quantity** (1–99, default 1, `quantity` column), which
Tidy merges as the largest, not the sum. "Milk — the small tin" stores a name and a note, and only the
name is searched. **Remembering a brand happens only in Your brands** (TEC-39): *Item*, then *this
exact product* (with **Paste**, King Soopers product pages only) or *better search words*. **`plain`
is refused by the editor and by Paste a batch**; the enum and `resolveLink` still honour old rows.
The editor sends no brand or note, and **a field not sent is not overwritten**. The `brand` column is
unused. Tidy is Haiku; `validateTidy` refuses a proposal that drops, doubles or invents a line.

**Send to cart — King Soopers** (`app/Cart.tsx`, under the list). **No model call anywhere.**
*Connect King Soopers* goes to `/kroger/connect`, then Kroger, then `/kroger/callback`. Both are
**route handlers outside `/api/`**, so an expired session bounces through the login, and **`proxy.ts`
has no exception for them**. The redirect URI is the constant `REDIRECT_URI` in `lib/kroger.ts`,
never built from the request. The OAuth `state` is a signed nonce, double-submitted in an httpOnly
`/kroger` cookie (`lib/krogerCrypto.ts`). **One connection row** (`kroger_connection`, `id` is a
boolean that can only be true) holds the refresh token **sealed** with AES-256-GCM under
`KROGER_TOKEN_KEY`. The table refuses a value without `v1:`. It also holds the store (plain) and
`refreshed_at`. The access token is never stored: each request refreshes once (`withAccessToken`),
and a rotated refresh token is resealed. **No route body carries a token**; `tests/kroger.test.ts`
reads every one. Scopes are `cart.basic:write product.compact`. A missing variable is named in
words on the list tab and in `/api/health`.
**The review** (`GET /api/kroger/cart`): an exact-product brand goes in as-is (its URL's digits are
the UPC, `productIdFromUrl`). Any other line shows Kroger's top match at the store. Joel ticks it, or
pastes a product page, which `savePreference` remembers under the line's name. **One Cart call per
line**, so each reports added, skipped or failed. **`sent_at`** marks a sent line. A send picking one
again is refused 409 before Kroger is touched, unless `again`. Tidy carries the latest `sent_at`.
*Go to checkout* is `CHECKOUT_URL` in `lib/kingsoopers.ts`, a constant.
**Refresh** (`lib/refresh.ts`, `POST /api/kroger/refresh`) checks every *exact product* brand at the
store. It writes `brand_products` (price, stock, page, `checked_at`). **A product Kroger stopped
returning gets `missing_since` and is kept**, shown in Your brands and on its collapsed toggle.
Search-word brands are counted, not checked. It runs on opening the list tab when `refreshed_at`
is over 7 days old (`lib/refreshDue.ts`, in the background), or on *Refresh now*. **No cron.**
`refreshed_at` moves only when the brands were checked.

**`GET /api/servings` is a contract** (TEC-11, one home `RULES.md`): every recipe per serving,
Cookbook dividing, unrounded, behind the ordinary session. `tests/servings.test.ts` holds its exact
fields; metadata never enters it. **Logging what you ate is Health's**, by design.

**Every failure has one status, in `lib/errors.ts`**: `LookupError` 503 means only that the database
did not answer — **Health reads a 503 as "couldn't reach the Cookbook"**; `InputError` 400;
`ConflictError` 409; `UpstreamError` 502 (Kroger; `reconnect: true` in the body when the stored
sign-in failed); `SetupError` 501 (a missing variable); anything else 500, via `lib/respond.ts`.

## Traps specific to this area

**Durable traps are in `DECISIONS.md`** — empty-vs-unread, the Supabase key, unconfigured `lint`.

- **`/list` is a path another app depends on** — Health's redirect (TEC-23) names it, and Health's
  own `/list` stays live until then; `tests/tabs.test.ts` holds it. Renaming it is cross-app.
- **The unread-page refusals and the re-estimate guardrail are settled** (`RULES.md`; the latter
  reconsidered and kept by Joel, 2026-09-22). Do not thin the checks or re-ask.
- **A client component must not import a lib that imports `supabase.ts`** — split the helper out.
- **Read Vercel and Supabase live before writing a deployment step** — #159 missed two that existed.
- **Kroger's request and response shapes were never loaded from here.** `developer.kroger.com` and
  `api.kroger.com` are refused by egress, so the shapes in `lib/kroger.ts` come from the brief and
  from public examples. These were confirmed by search only: the base URL, the OAuth paths, both
  scopes, `filter.term` (3 characters to 8 words), `filter.locationId`, 8-character location IDs and
  `filter.zipCode.near`. These were not confirmed: Basic auth on `/token`, `PUT /cart/add` with
  `{items:[{upc,quantity}]}` and no `modality`, `filter.chain=KINGSOOPERS`, `productPageURI`,
  `inventory.stockLevel` and `filter.productId` for a single product. **Joel's first Connect is the
  first real check**; if one is wrong, it is one constant or one parser in that file.
- **Changing `KROGER_TOKEN_KEY` orphans the stored token.** It cannot be opened under the new key,
  so the list tab says to connect again. That is the designed way to rotate the key.
- **Two refreshes at once can race the token rotation**, for example two tabs opening a stale list.
  If Kroger spends the old refresh token on the first, the second fails with `reconnect`. Kroger
  sign-in is unchanged; Connect again fixes it.
- **A remembered replacement's phrase is the line's whole name**, such as `2 cups whole milk`, so it
  only matches lines saying that. Shorten it in Your brands.
- **Preview and local deployments cannot complete a Kroger sign-in.** The redirect URI is
  production's, by registration.
- **The two Kroger migrations must be applied before this code is live**: `readList` selects
  `quantity` and `sent_at`, and `/api/preferences` reads `brand_products`.
- **`claude/health-recipes` is the design record, kept on purpose.** Never revive a merged
  `claude/cookbook-*` branch.
