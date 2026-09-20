# Cookbook — handoff

State as of 2026-09-20.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**The app is live and reading its database.** #159 and #160 are on `main`; item 27's last step was a
**wrong `SUPABASE_SERVICE_ROLE_KEY` value**, not a missing variable, fixed by Joel 2026-09-20.

**#165 — remembered brands for the shopping list — is open, and its gate belongs on `b5f7383`.**
Agreed with Joel 2026-09-20 over four messages; the reasoning is in the migration header. **Its
migration is written and not applied** — additive, so the TD applies it at gate time. Tap *milk* and
land on the milk you buy; the generic King Soopers search stays the fallback.

**The rule to keep hold of: longest matching phrase wins, and `plain` is a real answer** — `milk` →
Fairlife, `whole milk` → plain. Why that third kind is load-bearing is in the migration header.

**The rows are Joel's shopping and do not go in git.** The migration seeds nothing. A seed arrives
from a session that reads his receipts and hands back JSON, pasted into the shop section's
**Paste a batch** box — validated row by row, refusals named. **No receipt reaches this app.**

**Four gaps were named at Joel's intent review on 2026-09-20 and deliberately not built** — he said
close out instead, so they are his call, not a to-do left half-done. In his priority order: **the
table is the only copy** and nothing exports it, which is the unpaid cost of keeping the rows out of
git; **the import writes on trust** where his own workflow has a gate step (shape is checked,
judgement cannot be — `brand: Fairlife` with `terms: horizon organic` is well-formed and wrong); the
panel **hides `note`**, which the migration header calls the only thing making a row legible later;
and a brand can only be created **from a line already on the list**. The first two are worth doing
before a forty-row seed lands and matter less afterwards.

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

**Finish the brands branch**, then: editing a kept recipe's servings without re-estimating it, which
is what storing the pot was for and nothing exposes yet.

**Waiting on Joel:** the receipt-derived seed, and whether the ledger's item 27 can close — the app
reads its own schema now, which is the exposed-schemas step proving itself.

**Still the TD's:** the read contract (22) and the grocery-list move out of Health (23).
