# Cookbook — handoff

State as of 2026-09-20.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**#159 is open, gated and passed, and not merged.** Head `bf37647` plus this handoff correction.
The technical director ran its gate on 2026-09-20 and the change cleared it; **the merge was refused
by a harness permission, not by the gate or a check.** Joel grants it or merges it himself.

**The migration is applied** — `20260920031200`, before the merge, which is both the safe direction
and the rule, and read back under exactly the version its filename declares. The database is ahead of
the code: `cookbook.recipes` and `cookbook.grocery_items` exist, RLS on, **zero rows**.

## What is true now

**One page, because the surface is *site*.** A thin index grouped by verb — see what you could cook,
add a recipe, shop for it — wrapping one long page, the book first: for a collection the index *is*
the product. No tabs, no second route, no home-screen install. **Three ways in, one approval** — type
it, ask Claude, paste a link — and **nothing is written until Keep it.** The draft is not the book.

**Two tables, both in `cookbook` and nowhere else.** `recipes` stores **the whole pot** and derives
the serving; `grocery_items` is this app's own list. The reasoning is in the migration header, which
is where most of it lives now that #151 is closed. **`macro_source` has two values where Health's has
three** — no `web`, so a number lifted off a page is not storable rather than merely not written, and
`source_url` records where the **method** came from.

**Name collisions are refused by the database**, not by a lookup: `recipes_name_key` indexes the
normalised name, `normalizeName` in `lib/recipes.ts` matches that expression exactly, and
`tests/recipes.test.ts` is what holds the two in step.

**The list is the cheap version and that is a decision, not a gap.** Copied text or a King Soopers
search link — no credential, no OAuth, no `middleware.ts` change. Tidy is one Haiku call, and
`validateTidy` refuses a proposal that drops or doubles a line: the model can fail to tidy but cannot
lose your eggs. **Pricing helpings is arithmetic in the browser**, and **logging what you ate is
deliberately absent** — that hand-off is item 22 and the technical director's.

**`lib/models.ts` stays a per-app copy — settled, no longer an open flag.** Diffed at #159's gate
(76, 67 and 61 lines, no two alike) and written into `DECISIONS.md`: `packages/shared` means
byte-identical and these must not be. **No ledger row, and that is the answer.**

**You have a board URL**, seeded by the technical director and pasted into `KICKOFF.md` on
`claude/brief-cookbook-gate-followup`. Publish to it, never to a new one. **Until that branch merges,
the copy of `KICKOFF.md` on `main` still shows the blank.**

**The livery is borrowed and is not yours.** `clark` is the editor's — ledger item 24, TechPad Gen's.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook` and there is no per-query override.
  Health's `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **A failed read must never render as an empty book or an empty list.** Both would read as "nothing
  here", which is the opposite of what happened. `LookupError` → 503 everywhere, and the client
  leaves its state `null` rather than `[]`.
- **A page that could not be read is refused twice**, and the second check is the one that matters:
  the importer rejects a page claimed as read that produced no ingredients. A slug alone will invent
  a convincing chilli and you would cook it.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the Vercel
  project and the domain did not exist; **both already did.** It was written from the standup's
  checklist rather than from the dashboard, and the gate is what caught it.
- **`npm run lint` has no config here** and drops into ESLint's interactive setup. It is not in CI
  (`npm ci`, `npm test`, `npm run build`) and no app here has one — boilerplate, not a broken check.

## Next

**Nothing is yours until #159 merges.** After that: editing a kept recipe's servings without
re-estimating it — the whole reason the pot is stored is to make that a one-field edit, and nothing
exposes it yet.

**Waiting on Joel:** the merge permission on #159, and **item 27** — three environment variables
(`SESSION_SECRET` byte-identical to the other six), `cookbook` on the exposed-schemas list, then a
redeploy. `tp-cookbook` and its CNAME already exist.

**Still the technical director's:** the Health↔Cookbook read contract (22) and the grocery-list move
out of Health (23).
