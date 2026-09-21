# Cookbook — handoff

State as of 2026-09-21.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**Nothing of mine is unmerged, and everything of mine is live.** #165 merged as `f60e493` and
`tp-cookbook`'s production deployment is `READY` on it, read 2026-09-21. The app is in use — the
book and the list both hold rows.

**Remembered brands are deployed and empty.** `cookbook.brand_preferences` exists, RLS on, zero
policies, **zero rows**: the feature is live and nobody has saved a preference yet. Its migration
was applied at the gate and **recorded under exactly the version its filename declares**, which is
the read-back item 26 exists about.

**The seed has not arrived.** It comes from a session that reads Joel's receipts and hands back JSON
for the shop section's **Paste a batch** box — validated row by row, refusals named, **no receipt
reaching this app**. The format and the rules for that session are in #165's body.

**Four gaps were named at Joel's intent review on 2026-09-20 and deliberately not built** — he chose
close-out over building them, so they are his call, not work abandoned halfway. In his order: **the
table is the only copy** and nothing exports it, the unpaid cost of keeping the rows out of git;
**the import writes on trust** where his own workflow has a review step (shape is checked, judgement
cannot be — `brand: Fairlife` with `terms: horizon organic` is well-formed and wrong); the panel
**hides `note`**, which the migration header calls the only thing making a row legible later; and a
brand can only be created **from a line already on the list**. The first two are worth doing before
a forty-row seed lands and matter less afterwards.

## What is true now

**One page, because the surface is *site*** — a thin index by verb over one long page, book first;
the rules are in `.claude/SURFACE.md`, which uses this tool as its worked example. **Three ways in,
one approval** — type it, ask Claude, paste a link — and **nothing is written until Keep it.**

**Three tables, all in `cookbook` and nowhere else**, their reasoning in the migration headers.
`recipes` stores **the whole pot** and derives the serving; `grocery_items` is this app's own list;
`brand_preferences` is the new one. **`macro_source` has two values where Health's has three** — no
`web`, so a lifted number is not storable rather than merely not written. **A duplicate name or
phrase is refused by an index**, not a lookup, with a test holding each one's normaliser in step.

**The list is the cheap version and that is a decision, not a gap.** Copied text or a King Soopers
link — no credential, no OAuth, no `middleware.ts` change; a remembered brand changes the link, not
that rule. Tidy is one Haiku call and `validateTidy` refuses a proposal that drops or doubles a line.
**Logging what you ate is absent** — item 22, the TD's.

**`lib/models.ts` stays a per-app copy — settled in `DECISIONS.md`, no ledger row.** **Your board URL
is in `KICKOFF.md` on `main`.** **The livery is borrowed** — `clark` is the editor's, item 24.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, no per-query override. Health's
  `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **A failed read must never render as an empty book or list.** Both read as "nothing here", the
  opposite of what happened. `LookupError` → 503, and the client leaves its state `null`.
- **"Invalid API key" here is Supabase, not Anthropic** — reading the book or the list calls no model
  at all. It cost a wrong turn once.
- **A page that could not be read is refused twice**, the second check being the one that matters: a
  page claimed as read with no ingredients is rejected. A slug alone invents a convincing chilli.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the project and
  the domain did not exist; **both already did**, and item 27's wording went stale the same way in a
  day. The dashboard is the record, never the checklist.
- **`npm run lint` has no config here** — not in CI, and no app has one. Boilerplate, not a break.

## Next

**Nothing is in flight.** The next thing worth building is whichever of the four gaps above Joel
picks; after those, editing a kept recipe's servings without re-estimating it, which is what storing
the pot was for and nothing exposes yet.

**Waiting on Joel:** the receipt-derived seed, and a decision on those four. **Item 27's
exposed-schemas step looks already done** — every read this app makes goes through PostgREST on the
`cookbook` schema and they are working — but that is inferred from a working read, not from seeing
the setting, which no session here can reach. **Confirm by eye before closing the row.**

**Still the TD's:** the read contract (22) and the grocery-list move out of Health (23).
