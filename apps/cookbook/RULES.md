# Cookbook — charter

## Read first

Carried over from the retired agent preset (TEC-115). `NOTES.md` beside this file is the
app's state and traps; open work is in Linear under `app:cookbook`.

**The design is agreed and it is not yours to redo.** This charter was written with Joel on
2026-09-20 and carries forward two days of design argued out on `claude/health-recipes` — **1,624
lines that exist nowhere else.** Read #151's *Why* section and its closing comment in full before
changing anything. Re-deriving those decisions from scratch will produce worse answers slowly.

**Four things are settled and not yours to reopen**: the surface is *site*, and its tabs are the
verb index (`SURFACE.md`'s roster); macros are static and ingredients are text rather than a join;
an import never keeps a page's published numbers, it re-estimates them; and a page that could not
be read is refused rather than guessed, enforced twice.

**Never write to `health.*`.** The cross-app work is sequenced by the technical director and
arrives as Linear issues labelled `app:cookbook`. **The livery is borrowed from the theme**; do not
change it from here.

---

**First written on 2026-09-20 at standup** — the design conversation with Joel, in a
session that was not yet an agent — and carried through the standup by the technical director. It
has been redrafted since as decisions landed (TEC-11, TEC-15), by the technical director with Joel
approving each in its pull request, which is how every charter changes.

**Read `CLAUDE.md` first.** Its universal rules bind this tool and this file never overrides them;
it only adds.

---

## Where this comes from

`apps/health` built a recipe book across two days with Joel, as PR #151. Joel then asked the
question the build had skipped — *"Recipe Keeper a different app isn't it?"* — and answered it
himself on 2026-09-20: recipes are **their own app, own schema**, not Health's. #151 was closed
rather than merged, its migration was never applied, and **`claude/health-recipes` is kept on
purpose** as the design record — 1,624 lines argued out with Joel, most of it written down nowhere
else. Read the *Why* section of #151's body and its closing comment before changing anything here;
re-deriving those decisions from scratch will produce worse answers slowly.

**Settled at standup on 2026-09-20:**

- **Name: Cookbook.** "Recipe" stays Coffee's word — a brew, not a dish — which is why the newcomer
  was renamed rather than the incumbent.
- **Its own app, its own Postgres schema** (`cookbook`).
- **Surface: site.** A cookbook is a collection; the index is the product — you arrive to see what
  you could cook, which answers `SURFACE.md` question 2 plainly. Not thumb-first. **Its tabs —
  Recipes · Add · King Soopers list — are that index**, one verb each (browse, add, shop), each tab
  one long page: the TD's ruling on 2026-09-24, after Joel asked for tabs on 2026-09-22, and Add made
  its own tab at `/add` by Joel's override on 2026-10-05 (TEC-101).
- **Installable, and still a site** (Joel's override, 2026-10-05; recorded 2026-10-18, TEC-102). The
  No. 12 icon is the apple-touch-icon with `appleWebApp` metadata, so it goes on the home screen —
  but that is a shortcut, not a change of shape: the layout stays tabs and long pages. Whether it
  should become an app is TEC-109, parked until Joel has used it installed.
- **The grocery list moves here.** You shop from recipes, not from what you ate, so a list built
  from Cookbook's own ingredients belongs beside the book rather than beside the log. How it moves
  is below.
- **Health reads Cookbook to price a meal. Health does not own recipes.** The read is a cross-app
  contract, and it is the technical director's to design — it is below, decided on 2026-09-23.

---

## What this tool is

A recipe book, reached by four ways in:

1. **Type it.** You write the recipe; the model only prices it.
2. **Ask Claude.** You describe what you feel like; it writes one, then prices what it wrote.
3. **From a link.** It reads the page, then prices what it read — never what the page published.
4. **From a file.** A photo or a PDF of a recipe, read then priced, and never stored.

**Anything a model wrote lands as a draft, and keeping it is the write** — generated, or read off a
page or a file. A recipe you typed saves straight away: the only thing a draft would add is the
macros, an approval of your own words back.

From the book: **log a serving** (by tapping a recipe or dictating "two servings of my chilli" —
the parse and the price are Cookbook's; the log entry belongs to whichever app records what was
eaten, per the cross-app contract below), **add its ingredients to the grocery list**, or
**remove** it — which takes the recipe out and leaves anything already logged elsewhere untouched.

## What it stores

Its own schema, `cookbook`. The tables are this agent's to design, and the reasoning for each lives
in its migration's header. Two things were implied by the settled decisions and hold:

- **Recipes.** Store the whole pot; derive the serving — dividing is the lossless direction, and
  keeps "I got eight bowls, not six" a cheap edit. **Macros are static**, per Joel on 2026-09-18
  against Health's own recommendation that they be derived from linked ingredient rows: *"Recipes
  would have static macros."* So ingredients are text, not a join, and re-costing a recipe means
  estimating it again, on purpose. Carry `estimate` / `web`-style provenance and `source_url` from
  the health-recipes design, and keep the same meaning: `source_url` records where the *method*
  came from, never where a number did — imported nutrition is never retained, only re-estimated.
- **The grocery list.** Lines, ticked off, a `source` distinguishing a recipe-pushed ingredient from
  something added by hand, and a quantity (default 1). Health's `/list` shipped it as text or a link
  only, with no stored credential and no OAuth; **Joel reversed that for King Soopers on 2026-09-26
  (TEC-90)**, under *Send to cart* below. The reversal covers Kroger and nothing else.
- **One Kroger connection.** A refresh token, encrypted at rest under `KROGER_TOKEN_KEY`, and the
  chosen store. Never sent to the browser, never logged. Its scope is add-to-cart and product read,
  so the worst case is items in Joel's cart.

**Never another app's schema.** `lib/supabase.ts` pins `cookbook`; there is no default to override
per query. This tool never reads or writes `health.*` directly — what it exposes to Health is
through the contract below, not a cross-schema query.

## Guardrails carried from the health-recipes design

These were argued out with Joel already; they are about recipes, not about Health, and they do not
get relitigated here.

- **Import never lifts a page's numbers.** *"Only retain recipe. Then calculate macros and cals."*
  Where a page publishes real nutrition, throw it away and estimate. An imported recipe reads
  `estimate`, never `web`.
- **A page that could not be read is refused rather than guessed, enforced twice**, because a
  prompt can only ask. The prompt requires `read: false` on a paywall, a 404, a block or a
  non-recipe page; the importer independently rejects any page claimed as read that produced no
  ingredients. A slug alone is enough to invent a convincing recipe, and this is Coffee's trap
  wearing an apron — you would actually cook it.
- **Refuse a name collision.** A recipe named the same as something that already means something
  else in this tool's own data must not silently take that name over.
- **No merging without a look.** Pushing a recipe's ingredients onto the grocery list is additive;
  tidying the list stays a deliberate tap, never something that happens to the list as a side
  effect of adding to it.

## The grocery list — moved, and done

Health's list moved here (TEC-15, finished 2026-09-29): Health's `/list` redirects to this list,
and `health.grocery_items` is dropped.

## Send to cart — King Soopers (TEC-90, Joel 2026-09-26)

- **Connect once, from the list tab.** Kroger's sign-in returns to `/kroger/callback`, a page route
  behind the password gate, with no exception in the gate file. The client ID and secret stay
  server-side.
- **Pick a store once**, so lookups price and stock at that store.
- **Send to cart adds; it never checks out.** A line tied to an exact product in Your brands goes in
  as-is. Any other line shows Kroger's top match, and Joel adds it or replaces it with the exact
  product URL; a replacement is remembered in Your brands. **No model picks a product.**
- **Every line reports added, skipped or failed.** A partial send never reads as a whole one.
- **A second send warns and shows what was already sent.** The Cart API only adds, so a silent
  repeat doubles every quantity.
- **A link to checkout, not a checkout.** "Go to checkout" opens the King Soopers cart; the order is
  placed and paid there, never here.
- **Saved products stay current without a model.** Each saved brand keeps its Kroger product ID, page
  link, size, last price and stock at Joel's store, and when it was checked. A refresh runs when the
  list is opened more than seven days after the last one, or on **Refresh now**. It updates prices
  and stock, fills in missing product IDs, and **flags a product Kroger no longer returns** rather
  than dropping it. It also keeps the King Soopers connection alive. A failed refresh says so; it
  never reads as "nothing changed".
- **Kroger's public API cannot read the account**: no orders, no cart contents, no purchase history.
  Nothing here claims to know what was bought.
- **Kroger is mocked in tests**, because no session here can reach it. The first real check is Joel
  connecting on production.

## The Health↔Cookbook contract — the technical director's, and this is its one home

Health prices a meal — works out its calories and macros — by reading Cookbook. **Health calls a
Cookbook API from its server; it never reads `cookbook` tables** (option A, Joel, 2026-09-23,
TEC-11). Health's charter points here rather than copying it. **Changing it is the TD's call;
building your side of it — `GET /api/servings`, TEC-24 — is yours.**

- **One route: `GET /api/servings`.** Every recipe in the book, per serving:
  `{ recipes: [{ id, name, servings, per_serving: { kcal, protein_g, carbs_g, fat_g } }] }`.
  **Cookbook does the division** — the table stores the whole pot — so Health never learns that
  convention. Nothing else under `/api` is contract; it stays yours to change freely.
- **Additive only.** A new field is free. Renaming or removing one is a contract change.
- **Authentication is the session you already have.** Health's server forwards the caller's
  `paddock_session` cookie — that one cookie, not the whole header — to a fixed origin,
  `COOKBOOK_BASE_URL`, defaulting to `https://cookbook.techpaddock.io`, **never a URL taken from the
  request**. Your gate file (`proxy.ts` since Next 16) already accepts any request bearing a valid session, so **there is
  no carve-out** and the password gate stays three variants. It rests on `SESSION_SECRET` parity,
  which `CLAUDE.md` already requires; a mismatch reads as the Cookbook being down.
- **It works only inside a request you made.** A background job has no session to forward, and
  that is deliberate: this read happens when you log a meal, not on a timer.
- **Down is never "not found".** A timeout, a 401 or a 5xx surfaces in Health as "couldn't reach the
  Cookbook", never as "no such recipe" — Health's second guardrail, unchanged.
- **Health snapshots the numbers at log time** (TEC-21, approved 2026-09-24), so this is read once
  per entry and a later edit to a recipe never rewrites a past day.
