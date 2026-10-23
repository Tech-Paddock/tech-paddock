# Cookbook — rules

Adds to `CLAUDE.md`. State and traps: `NOTES.md`. Open work: Linear, `app:cookbook`; cross-app
work is sequenced by the technical director.

## Settled

Not reopened here. The design record is the kept branch `claude/health-recipes`; read #151's *Why*
section and closing comment before changing anything in this file.

- Name: Cookbook ("recipe" is Coffee's word, for a brew). Own app, own schema `cookbook`.
- Macros are static; ingredients are text, not a join. Re-costing means estimating again.
- The grocery list lives here. Health does not own recipes.
- The livery is the theme's; it is not changed here.

## Surface: site

- A thin index grouped by verb, not entity. A tab bar is fine when each tab is a verb and one long
  page.
- One long page over many routes.
- Works on a phone, but is not designed around one-handed use.
- No home-screen install unless the owner grants one; the shape does not change.
- `/admin` and `/debug` never appear in navigation and do not count as screens.
- The tabs Recipes · Add · King Soopers list · Your brands · Deals are the verb index: browse,
  add, shop, remember, save. Deals arrives with TEC-132. Installable is a shortcut, granted by the
  owner; becoming an app is TEC-109.

## Recipes

- Four ways in, in this order: ask Claude (it writes, then prices); from a link (read, then
  priced); from a file (photo or PDF, read then priced, never stored); type it (the model only
  prices it).
- Anything a model wrote lands as a draft; keeping it is the write. A typed recipe saves at once.
- **Import keeps only the recipe.** Published nutrition is discarded and re-estimated; the macro
  source is `estimate`, never `web`. `source_url` records where the method came from, never a
  number.
- **An unread page is refused twice**, because a prompt can only ask: the prompt requires
  `read: false` on a paywall, 404, block or non-recipe page, and the importer rejects any page
  claimed as read that produced no ingredients.
- A recipe stores the whole pot; the serving is derived.
- A recipe must not take a name that already means something else in this app's data.
- From the book: log a serving (tap or dictate), add its ingredients to the list, or remove it.
  Cookbook parses and prices the serving; the log entry belongs to the app that records what was
  eaten. Removing a recipe leaves anything logged elsewhere untouched.

## Storage

- Only the `cookbook` schema, pinned in `lib/supabase.ts` with no per-query override. Never read or
  write `health.*` or any other schema.
- Each table's reasoning lives in its migration header.
- A grocery line has a ticked state, a `source` (recipe or by hand) and a quantity, default 1.
  Adding to the list is additive; tidying is a deliberate tap, never a side effect.
- **A list line reads as what you buy:** the item without prep words ("garlic, thinly sliced" →
  garlic, or the saved product's shopping unit, "Heads of Garlic"), then its recipes, then the
  combined recipe amount. The stored line is never rewritten for this.
- **The quantity is what goes in the cart, rounded up.** A saved product may carry a pack
  conversion (1 head = 10 cloves): the amount becomes packs, rounded up. Without one, a typed
  count is the quantity ("2 onions", "3 bunches cilantro"), and a measure (tsp, cup) is one
  container. The user can still change it. These are fixed rules; no model runs. They apply
  whether or not Tidy ran.
- Kroger is the only stored credential: one refresh token, encrypted under `KROGER_TOKEN_KEY`, plus
  the chosen store. Never sent to the browser or logged. Scope: add-to-cart and product read.
- **Your brands is one row per King Soopers product code.** The row holds its names: every way a
  list line may refer to it, each matched as whole words. A name may sit on several products; a
  product code is never saved twice. Search words stay their own kind: a name with search words
  and no product. Each name may mark one of its products as the **default**.
- **Each product carries a count.** It starts from the owner's own purchase history, which is
  supplied by hand and never stored or committed, and goes up by one each time Send adds it. It
  ranks choices; it never claims what was bought.
- **Each product keeps the size first bought beside the size Kroger reports now.** A refresh that
  sees a different size flags it, with price per unit, and never overwrites the size first bought.
- **Paste a batch shows every row for a tick before anything is written,** and Your brands exports
  in the same format.

## Send to cart — King Soopers

- Connect once from the list tab. Kroger returns to `/kroger/callback`, a page route behind the
  password gate with no gate-file exception. Client ID and secret stay server-side.
- Pick a store once; lookups price and stock there.
- Send adds; it never checks out. "Go to checkout" opens the King Soopers cart.
- **Send groups the list into Going in, Pick one and Not saved yet.**
  - **Going in:** a line that matches one product, its name's default, or a saved product the line
    names.
  - **Pick one:** a line that matches several products and has no default. The most-bought is
    pre-picked, and a **Make default** checkbox sets it as the default.
  - **Not saved yet:** Kroger's top match, ticked to add, or replaced with a product URL.
  - Whichever goes in is remembered: the line's name is added to that product's names, or a new
    product row is made.
- **A named product beats the default.** "english muffins" gets the default; "sourdough english
  muffins" gets the saved sourdough.
- **Nothing is skipped silently.** A line stays unsent only on **Not this trip**. After Send, every
  unsent line stays listed under **Still on your list**.
- **A line is searched by its item alone.** A fixed rule drops quantities, units and prep words,
  and reads "X of Y" as "Y X": "6 cloves of garlic" searches "garlic cloves". No model runs.
- **A line that is a product code goes in as that product.** A line that matches none of the saved
  names is matched against each saved product's official Kroger name, and that product is offered
  only when Kroger's own search for the item also returns it, so "spaghetti" never matches a sauce.
  One hit goes straight in; several go to Settle these.
- No model picks a product or runs anywhere in this flow.
- Every line reports added, skipped or failed; a partial send never reads as whole.
- A second send warns and shows what was already sent, because the Cart API only adds.
- **Take back** removes what Cookbook sent, by sending negative quantities of the same products, and marks those lines unsent. It never claims the cart is empty: anything added elsewhere stays, and the button says so. If Kroger refuses a negative quantity, it reports that per line and offers the cart page.
- Each saved brand keeps product ID, page, size, last price, stock and when checked. Refresh runs
  on opening the list over seven days after the last, or on **Refresh now**. It updates price and
  stock, fills missing IDs, keeps the connection alive, and flags a product Kroger no longer
  returns rather than dropping it, and offers the closest product by name as its successor;
  replacing keeps the names and count, and happens only on a tap. A failed refresh says so.
- The API cannot read the account; nothing here claims to know what was bought.
- Kroger is mocked in tests.

## Health↔Cookbook contract

Its one home. Changing it is the technical director's call; building Cookbook's side is the
builder's.

- Health calls `GET /api/servings` from its server and never reads `cookbook` tables. It returns
  every recipe per serving, Cookbook dividing:
  `{ recipes: [{ id, name, servings, per_serving: { kcal, protein_g, carbs_g, fat_g } }] }`.
  Nothing else under `/api` is contract.
- Additive only. Renaming or removing a field is a contract change.
- Health's server forwards only the `paddock_session` cookie to the fixed origin
  `COOKBOOK_BASE_URL` (default `https://cookbook.techpaddock.io`), never a URL from the request.
  The gate accepts any valid session, so there is no carve-out.
- It works only inside a user request; a background job has no session.
- A timeout, 401 or 5xx reads in Health as "couldn't reach the Cookbook", never "no such recipe".
- Health snapshots the numbers at log time; a later edit never rewrites a past day.
