# Cookbook — rules

Adds to `CLAUDE.md`. State and traps: `NOTES.md`. Open work: Linear, `app:cookbook`; cross-app
work is sequenced by the technical director.

## Settled

Not reopened here. The design record is the kept branch `claude/health-recipes`; read #151's *Why*
section and closing comment before changing anything in this file.

- Name: Cookbook ("recipe" is Coffee's word, for a brew). Own app, own schema `cookbook`.
- Macros are static; ingredients are text, not a join. Changing the ingredients means estimating the macros again.
- The grocery list lives here. Health does not own recipes.
- The livery is the theme's; it is not changed here.

## Surface: site

- A thin index grouped by verb, not entity. A tab bar is fine when each tab is a verb and one long
  page.
- One long page over many routes.
- Works on a phone, but is not designed around one-handed use.
- No home-screen install unless the owner grants one; the shape does not change.
- `/admin` and `/debug` never appear in navigation and do not count as screens.
- The tabs Recipes · Grocery list · Deals · Add · Your brands are the verb index: browse,
  shop, save, add, remember. Installable is a shortcut, granted by the
  owner; becoming an app is TEC-109.

## Recipes

- Four ways in, in this order: ask Claude (it writes, then estimates the macros); from a link
  (read, then macros estimated); from a file (photo or PDF, read, then macros estimated, never
  stored); type it (the model only estimates the macros). Every way in applies the house style
  (`lib/houseStyle.ts`).
- Anything a model wrote lands as a draft; keeping it is the write. A typed recipe's draft is kept
  at once, without a tap. **The one exception is an ingredient edit:** it re-estimates the macros of the
  whole pot through the model and writes at once, with no draft.
- **Import keeps only the recipe.** Published nutrition is discarded and re-estimated; the macro
  source is `estimate`, never `web`. `source_url` records where the method came from, never a
  number.
- **There is no recipe Tidy** (owner, 2026-11-02). Every way in applies the house style, so a recipe
  arrives in it; nothing rewrites the book in a batch. **Revert to imported** puts back
  `imported_original` (ingredients, method, servings), clears the macros and `house_style_at`, and
  runs no model. **Estimate macros** (Macros tab) estimates a recipe that has none. The grocery
  list's Tidy is a separate feature and stays.
- **The recipe side never says price** (owner, 2026-11-02): "estimate macros" is the word. Dollars
  live only on the grocery list and Deals. `tests/recipeSideWords.test.ts` enforces it on the
  recipe-side files.
- **A recipe can be saved before its macros are estimated** (TEC-200): kcal, protein_g, carbs_g,
  fat_g and source are then all null, and model too, never a zero. Readers say "Macros not
  estimated yet" and skip it in arithmetic; `GET /api/servings` leaves it out.
- **The meal is one of Main · Side · Breakfast · Snack · Dessert · Creami, or none, which reads as
  Other** (owner, 2026-11-02). Other is never stored or offered to a model; a model's or a
  request's "dinner" or "lunch" reads as Main.
- **The meal list lives in `cookbook.meal_ok` and `MEALS`** and changes by
  `create or replace function`, never by a constraint swap.
- **An unread page is refused by three checks**, because a prompt can only ask: the prompt
  requires `read: false` on a paywall, 404, block or non-recipe page; the importer rejects any page
  claimed as read that produced no ingredients; and an import where no fetch returned a page is
  refused without asking the model. Only the third catches a recipe written from the URL slug.
- A recipe stores the whole pot; the serving is derived.
- A recipe stores no allergen or free-of claim and no macro tag, and its rating never comes from a
  model.
- A recipe must not take a name that already means something else in this app's data.
- An open recipe is **tabs Ingredients · Method · Macros**, the rating at the top, **Add to list**
  by day, Edit and Remove; no helpings estimator, and no keywords shown anywhere (TEC-183; the
  fields stay stored and editable). **Cookbook does not log what was eaten** (owner, 2026-10-26): Health does, from `GET /api/servings` under the
  contract below. Removing a recipe leaves anything Health logged untouched.

## Storage

- Only the `cookbook` schema, pinned in `lib/supabase.ts` with no per-query override. Never read or
  write `health.*` or any other schema.
- Each table's reasoning lives in its migration header. Headers are history as of their date;
  RULES.md and NOTES.md win.
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
- **Bulk produce reads as a bag** (TEC-190). Where the list reads a line as what you buy, a plain
  count over the limit becomes one bag: more than 3 onions a 3 lb bag, more than 3 potatoes a 5 lb
  bag, more than 4 carrots a 2 lb bag, more than 4 lemons or limes a bag. The line shows, is
  searched and is remembered as the bag, with "was 5 onions" beside it, and counts as one. A
  measure ("2 cups chopped onion"), green onions, sweet potatoes and baby carrots are not bulk. A
  saved product with its own pack conversion decides instead, and a saved product that is the bag
  (a name that says its size, or "bag" in its Kroger name) beats search, as any saved product
  does; a saved loose onion never decides a bag. Fixed rules; no model runs. The stored line is
  never rewritten.
- **The list's totals are summed, not asked for** (TEC-190). Each line is priced from its saved
  product's latest night in `price_nights` (the sale price on a night it was on sale) times its
  quantity; List and In cart each show a total, labelled with the night the prices are from. A
  line with no saved product, no recent price or several saved products that nothing separates (no default, fit, purchases or count) is "no price yet", counted
  in the total's line and never $0. Nothing calls Kroger to price the list.
- **A list line says what its price means, from the same nightly data** (TEC-196). On List and In
  cart each line is **item · qty · price** on **one line** (owner, 2026-11-02): the name truncates
  with an ellipsis and the full text is the line's `title`, while the quantity, the price and the
  buttons keep their size. No recipe names, mark, bubble, amount or note show. The **bubble**
  ("Sale $2.99" when the saved product's night has promo below regular, "Coupon" only when a staged
  coupon (`cookbook.coupons`) lists its code; never invented) and the shade's words are on the
  price's `title` and accessible name. The line is **shaded by the
  Deals stoplight for that product**: green when Deals calls it green, red when red, plain
  otherwise; **before 4 weeks of history, on sale or with a coupon is good, else plain, never red**.
  A line with no saved product or no recent price stays plain. Colour is never the only cue: the
  price's `title` and accessible name ("Good price", "High price", the bubble) say why. A line's shade and the Deals board come
  from one function and never disagree. A **Best** toggle on the List shows only the lines that are
  Best (below). No Kroger call, no model.
- Kroger is the only stored credential: one refresh token, encrypted under `KROGER_TOKEN_KEY`, plus
  the chosen store. Never sent to the browser or logged. Scope: add-to-cart and product read.
- The Kroger access token is never stored.
- `cart_sends`, the cart ledger, is append-only except `item_id`, which follows a line through a
  Tidy. A line Clear cart clears is marked, not deleted, so its ledger rows keep their `item_id`.
- **Your brands is one row per King Soopers product code.** The row holds its names: every way a
  list line may refer to it, each matched as whole words. A name may sit on several products; a
  product code is never saved twice. Search words stay their own kind: a name with search words
  and no product. Each name may mark one of its products as the **default**, set only by hand with Make default in Your brands. Nothing sets one automatically: not Send, not the splash.
- **Each product carries a count.** It starts from the owner's own purchase history, which is
  supplied by hand and never stored or committed, and goes up by one each time Send adds it. It
  ranks choices; it never claims what was bought.
- **Purchases are the record of what was actually bought** (TEC-213). Your brands, Import purchases
  takes pasted King Soopers order history, one JSON object per line, into `cookbook.purchases`:
  append only, one row per order line, a re-paste adds nothing. Signed in like every `/api` route;
  there is no signed-out path. A line matches a saved product by code, then by its Kroger
  description, and is kept unmatched otherwise; a match never adds a name. A bad line is counted
  and skipped, never guessed. No purchase data is committed or kept in the repo.
- **Each product keeps the size first bought beside the size Kroger reports now.** A refresh that
  sees a different size flags it, with price per unit, and never overwrites the size first bought.
- **Paste a batch shows every row for a tick before anything is written,** and Your brands exports
  in the same format.

## Send to cart — King Soopers

- Connect once from the list's header. Kroger returns to `/kroger/callback`, a page route behind the
  password gate with no gate-file exception. Client ID and secret stay server-side.
- The OAuth `state` is a signed nonce, double-submitted in an httpOnly cookie, and checked before
  anything else.
- The redirect URI is a fixed constant, never built from the Host header.
- Pick a store once; lookups price and stock there.
- Send adds; it never checks out. "Go to checkout" opens the King Soopers cart.
- **The Grocery list is two sections, List and In cart.** List is what is still to send; In cart is what Cookbook sent and has not taken back or cleared (`sent_at`, with the ledger behind it). A line is in one, never both. A cleared line (`cleared_at`) is in neither.
- **Cookbook is the only way anything enters the cart** (owner, 2026-11-02): In cart is the whole King Soopers cart; the King Soopers app is only for checkout.
- **No secondary pop-up lists.** **Adds never ask** (owner, 2026-11-02: "No confirmation. I clicked it, it goes."): Send all and Add to cart go at once. Remove, Clear cart, Tidy, Clear ticked and Clear all each ask one "Are you sure?" with a count, and no list.
- **Send is a best guess, with no review** (owner, 2026-11-02). One saved product or the name's default goes in; of several with no default, the pack that fits the line's amount (the smallest that covers it, else the closest; 1 lb is 16 oz), then the most purchased in the last 12 weeks from Import purchases, then the most recent purchase, then the count when nothing has been purchased; with none saved, Kroger's top match. A send never sets a default. Whatever goes in is remembered as before. A send reports in one toast, "Sent 12" or "Sent 12 · 2 not sent"; a line that did not go reads a red "not sent" in its price spot until the next send. There is no Sent list. Add to cart on one line uses the same guess.
- **The one picker that stays:** Add an item opens a choice of products only when several match and nothing separates them (no default, no fit, no purchases, equal counts); tapping one adds it to the cart. It never sets a default. There is no Change on an In cart line.
- **Ticked lines sort to the bottom of the List, faded.**
- **Refresh cart** fixes In cart from the ledger, then prices each In cart line today at the chosen store from the product read with the app token, never the account token, and shows the live In cart total with the time checked. A line Kroger cannot price reads "no price", never $0.
- **The header holds King Soopers** (owner, 2026-11-02): a live status always visible (Connected, Sign-in expired, Can't reach King Soopers, Not connected or Not set up), checked on open, after any King Soopers call fails and when tapped, plus connect, Pickup/Delivery, the store (tap for a ZIP search), prices checked, Refresh now and disconnect. Nothing King Soopers sits below In cart. The check proves the sign-in works; the API cannot read the cart. `GET /api/kroger/check` is signed-in only like every `/api` route, and returns a state, never a token. **Add an item** sits below the List's filters.
- **A named product beats the default.** "english muffins" gets the default; "sourdough english
  muffins" gets the saved sourdough.
- **A line is searched by its item alone.** A fixed rule drops quantities, units and prep words,
  and reads "X of Y" as "Y X": "6 cloves of garlic" searches "garlic cloves". No model runs.
- **A line that is a product code goes in as that product.** A line that matches none of the saved
  names is matched against each saved product's official Kroger name, and that product is offered
  only when Kroger's own search for the item also returns it, so "spaghetti" never matches a sauce.
  One hit goes straight in; of several, the most-bought goes in.
- No model picks a product or runs anywhere in this flow.
- Every line reports added, skipped or failed; a partial send never reads as whole.
- A line already in the cart is not offered again, and the server still refuses to send it twice
  without an explicit "again", because the Cart API only adds.
- **Take back** (Remove on one line) removes what Cookbook sent, by sending negative quantities of the same products,
  and marks those lines unsent.
- **Clear cart always clears** (owner, 2026-11-02): after one confirm with a count it sends a negative for every In cart line, with its recorded Pickup/Delivery choice, then marks every one of those lines cleared (`cleared_at`) whatever King Soopers answers: a refusal, a failure or no sign-in. Nothing is retried. Cleared lines leave the grocery list and do not return to the List; the line and its ledger rows are kept, never deleted. The result is one toast: "Cleared N from the cart.", and when King Soopers refused any, "King Soopers didn't take back M; check its cart" with the cart link. Refresh cart never puts a cleared line back. There is no Done shopping button.
- Take back writes its `taken_back` rows before the negative add, so a failure never removes
  twice. It acts only on lines still on the list (not cleared), and is never retried without the recorded
  Pickup/Delivery choice.
- Each saved brand keeps product ID, page, size, last price, stock and when checked. Refresh runs
  when any Cookbook page loads over seven days after the last, or on **Refresh now**; the weekly
  deal scan, which fills a Deals row for a product with no fresh night, starts the same way. Every tab panel is mounted, so
  the cart hook's mount effect runs both from any tab. **The refresh is what keeps the Kroger
  sign-in alive.** It updates price and stock, flags a product Kroger no longer returns rather than
  dropping it, and offers the closest product by name as its successor; replacing keeps the names
  and count, and happens only on a tap. A failed refresh says so. **Its log is one summary line,
  collapsed** (checked, updated, sizes changed, and any product not returned or not checked); the
  detail opens on a tap, and a failed refresh stays open.
- The API cannot read the account; nothing here claims to know what was bought.
- Kroger is mocked in tests.

## Deals

- **Every night, about 03:00 Denver time,** Vercel Cron calls `/api/cron/prices`. It records each
  saved product's regular and sale price and stock at the chosen store: one row per product per
  night, insert only. It uses Kroger's app token (product read), never the owner's account token.
  No model runs.
- **The one path a scheduler may call without a session is `/api/cron/prices`**, approved by the
  owner in TEC-132. Every app's `proxy.ts` admits exactly that path, and only with
  `Authorization: Bearer <CRON_SECRET>`. The secret is at least 32 characters, compared in constant
  time; an unset or short secret refuses everything, and a session cookie does not open the path.
  The route checks the secret again and is GET only (`lib/cronAuth.ts`). Another sessionless path
  is a change to the shared auth plumbing, so it is the owner's.
- **Every Monday, the past week rolls up** into one row per product: low, high, mean, regular mean,
  nights on sale and nights seen. Nightly rows are kept, never deleted.
- **A missed night is a gap.** It is never backfilled or guessed. A week whose Monday roll-up was
  missed is rolled up on the next run, from the nightly rows that exist.
- **A deal's colour compares today's price with that product's last 12 weeks:**
  - **green** at least 15% under the mean, or at or below the 12-week low while also below the mean;
  - **red** at least 10% over the mean, even when Kroger calls it a sale;
  - otherwise no colour.
  - Under 4 weeks of history it reads "new: building history".
  - The thresholds are reviewed in TEC-138.
- **Deals shows every deal, coloured,** with search, aisle groups, All · On sale · Coupon · Stacks · Best,
  and an Any · Green · Neutral · Red · New filter. Each deal shows its usual price and an 8-week
  trend.
- **Best** (TEC-196; the owner's pick, 2026-10-29) is tonight's price at, or within 5% of, that
  product's lowest nightly price in the last 12 weeks, and needs at least 2 nights. It is one pure
  function (`lib/bestPrice.ts`) used by Deals and the Grocery list, so they never disagree. Its
  empty state says why: under 2 nights, or nothing at its low.
- **Deals says when the nightly check last ran,** and **every empty filter says why** (TEC-190):
  the colours cannot show before 4 weeks of prices, so Green, Neutral and Red say when they start
  until then.
- **Coupons come only from the owner's own Chrome task (TEC-126),** reviewed before saving. Until it
  runs, Coupon and Stacks say "no coupons staged yet". **Stacks** marks a product with both a sale
  and a coupon.

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
