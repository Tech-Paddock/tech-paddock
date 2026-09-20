# Cookbook — handoff

State as of 2026-09-20.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**Nothing of mine is unmerged.** #159 and #160 are both on `main`, and `tp-cookbook`'s production
deployment is `READY` on it, read live 2026-09-20.

**The app is up and the list read fails.** `Couldn't read the list: Invalid API key` is Supabase's
own gateway rejection, reached through `lib/grocery.ts` → `LookupError` → 503 — the error path
working, naming the cause instead of rendering an empty list. **All three environment variables now
exist on `tp-cookbook`**, so what is left is one **wrong value**, not a missing variable, and it is
Joel's to paste. Legacy JWT keys on `qyclakzsupyxgnqfgpiq` are **not** disabled, so a `service_role`
JWT is still a valid thing to hold, and **an env change needs a redeploy** to reach a running
deployment.

**`SESSION_SECRET` and `APP_PASSWORD_HASH` are not project-level here — and that is not a gap.**
`tp-health` does not carry them either and its login works, so they are team-level; item 27's wording
predates that live read. **The exposed-schemas step is unverified and cannot be verified from here** —
the egress proxy refuses `*.supabase.co`. **The tell is the error text**: an unexposed schema answers
`PGRST106` naming what it will accept, never `Invalid API key`.

## What is true now

**One page, because the surface is *site*.** A thin index grouped by verb — see what you could cook,
add a recipe, shop for it — over one long page, book first: for a collection the index *is* the
product. **Three ways in, one approval** — type it, ask Claude, paste a link — and **nothing is
written until Keep it.**

**Two tables, both in `cookbook` and nowhere else.** `recipes` stores **the whole pot** and derives the
serving; `grocery_items` is this app's own list, and the reasoning is in the migration header.
**`macro_source` has two values where Health's has three** — no `web`, so a number lifted off a page is
not storable rather than merely not written, and `source_url` records where the **method** came from.
The migration is applied, RLS on, **zero rows**.

**Name collisions are refused by the database**, not by a lookup: `recipes_name_key` indexes the
normalised name, `normalizeName` in `lib/recipes.ts` matches it exactly, and `tests/recipes.test.ts`
holds the two in step.

**The list is the cheap version and that is a decision, not a gap.** Copied text or a King Soopers
search link — no credential, no OAuth, no `middleware.ts` change. Tidy is one Haiku call and
`validateTidy` refuses a proposal that drops or doubles a line. **Pricing helpings is browser
arithmetic**; **logging what you ate is deliberately absent** — item 22, the TD's.

**`lib/models.ts` stays a per-app copy — settled in `DECISIONS.md`, no ledger row.** **Your board URL
is in `KICKOFF.md` on `main`**; publish to it, never a new one. **The livery is borrowed** — `clark` is
the editor's, item 24.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, no per-query override. Health's
  `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **A failed read must never render as an empty book or list.** Both read as "nothing here", the
  opposite of what happened. `LookupError` → 503, and the client leaves its state `null`.
- **"Invalid API key" on this app is Supabase, not Anthropic.** Reading the book or the list calls no
  model; only `/api/recipes/draft` and `/api/grocery/tidy` hold an Anthropic key. Chasing the wrong
  key is the obvious wrong turn and the error text does not disambiguate it for you.
- **A page that could not be read is refused twice**, and the second check is the one that matters:
  the importer rejects a page claimed as read that produced no ingredients. A slug alone invents a
  convincing chilli and you would cook it.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the project and
  the domain did not exist; **both already did**, and item 27's wording went stale the same way within
  a day. The dashboard is the record, never the checklist.
- **`npm run lint` has no config here** — not in CI, and no app has one. Boilerplate, not a break.

## Next

**Nothing is yours until the app can read its own database.** Then: editing a kept recipe's servings
without re-estimating it, which is what storing the pot was for and nothing exposes yet.

**Waiting on Joel:** the right `SUPABASE_SERVICE_ROLE_KEY` on `tp-cookbook` plus a redeploy, then
`cookbook` on the exposed-schemas list if it is not there (item 27).

**Still the TD's:** the read contract (22) and the grocery-list move out of Health (23).
