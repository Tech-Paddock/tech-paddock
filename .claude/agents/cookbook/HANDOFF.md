# Cookbook — handoff

State as of 2026-09-20.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**The book is built and pushed on `claude/cookbook-build-the-book`.** Not merged, and **its migration
is not applied** — the technical director applies migrations at gate time, before merging. Until then
this app compiles and deploys but every read 503s, because `cookbook.recipes` and
`cookbook.grocery_items` do not exist yet.

## What is true now

**One page, because the surface is *site*.** A thin index grouped by verb — see what you could cook,
add a recipe, shop for it — wrapping one long page. The book reads first: for a collection the index
*is* the product. No tabs, no second route, no home-screen install.

**Three ways in, one approval.** Type it, ask Claude, or paste a link — all three land as a draft and
**nothing is written until Keep it.** The draft is not the book.

**Two tables, both in `cookbook` and nowhere else.** `recipes` stores **the whole pot** and derives
the serving; `grocery_items` is this app's own list. The reasoning is in the migration header, which
is where most of it is written down now that #151 is closed.

**`cookbook.macro_source` has two values where Health's has three.** There is no `web`, so a number
lifted off a page is not storable rather than merely not written — the import guardrail became a type.
`source_url` records where the **method** came from.

**Name collisions are refused by the database**, not by a lookup. `recipes_name_key` indexes
`lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))` and `normalizeName` in `lib/recipes.ts` matches
it exactly; `tests/recipes.test.ts` is what holds the two in step.

**The list is the cheap version and that is a decision, not a gap.** It leaves as copied text or a
King Soopers search link — no retailer credential, no OAuth, no `middleware.ts` change. Tidy is one
Haiku call, and `validateTidy` refuses a proposal that drops or doubles a line: the model can fail to
tidy but cannot lose your eggs.

**Pricing helpings is arithmetic in the browser** — no model, nothing written. **Logging what you ate
is deliberately absent**: that hand-off is ledger item 22 and the technical director's.

**The livery is borrowed and is not yours.** `clark` is the editor's — ledger item 24, TechPad Gen's.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook` and there is no per-query override.
  Health's `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **`lib/models.ts` is the third copy of Coffee's registry**, by way of Health. Flagged rather than
  quiet, per `CLAUDE.md`. Whether it becomes a sixth file in `packages/shared` is the technical
  director's call — **it is not on the ledger yet and wants a row.**
- **A failed read must never render as an empty book or an empty list.** Both would read as "nothing
  here", which is the opposite of what happened. `LookupError` → 503 everywhere, and the client
  leaves its state `null` rather than `[]`.
- **A page that could not be read is refused twice**, and the second check is the one that matters:
  the importer rejects anything claimed as read that produced no ingredients. A slug alone will
  invent a convincing chilli and you would cook it.
- **`npm run lint` has no config here** and drops into ESLint's interactive setup. It is not in CI
  (`npm ci`, `npm test`, `npm run build`) and no app here has one — boilerplate, not a broken check.
- **The exposed-schemas list in the Supabase dashboard is outside this repo.** If `/api/health`
  reports a permissions failure against `cookbook`, check that list before suspecting the key.

## Next

**Nothing is yours until the branch merges and the migration is applied.** After that: editing a kept
recipe's servings without re-estimating it. The whole reason the pot is stored is to make that a
one-field edit, and nothing exposes it yet.

**Two things stay the technical director's**: the Health↔Cookbook read contract (item 22), which is
what would let a helping reach a food log, and the grocery-list move out of Health (item 23).

**You still have no board URL** — item 25. Until Joel pastes one into your kickoff block, deliver the
three-part sign-off in chat and say out loud that it is in chat because there is no URL. Do not
publish to a new page.
