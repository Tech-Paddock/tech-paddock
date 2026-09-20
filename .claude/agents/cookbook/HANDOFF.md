# Cookbook — handoff

State as of 2026-09-20.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**The app is live and reading its database.** #159 and #160 are on `main`; item 27's last step was a
**wrong `SUPABASE_SERVICE_ROLE_KEY` value**, not a missing variable, and Joel fixed it 2026-09-20.
**`SESSION_SECRET` and `APP_PASSWORD_HASH` are team-level, not missing** — `tp-health` does not carry
them either and its login works.

**`claude/cookbook-brand-preferences` is the open work: remembered brands for the shopping list.**
Agreed with Joel 2026-09-20 over four messages, and the reasoning is in the migration header. **Its
migration is written and not applied** — additive, so the TD applies it at gate time. Tap *milk* and
land on the milk you buy; the generic King Soopers search stays the fallback.

**The rule to keep hold of: longest matching phrase wins, and `plain` is a real answer.** `milk` →
Fairlife, `whole milk` → plain. Without a preference that means *search this ordinarily*, the only
way to stop a broad phrase reaching a narrow line is to never write the broad one — which is the
version needing a row per wording. **`normalizePhrase` must stay identical to
`brand_preferences_phrase_key`**; `tests/preferences.test.ts` holds them in step.

**The rows are Joel's shopping and do not go in git.** The migration seeds nothing. A seed arrives
from a session that reads his receipts and hands back JSON, pasted into the shop section's
**Paste a batch** box — validated row by row, refusals named. **No receipt reaches this app.**

## What is true now

**One page, because the surface is *site*.** A thin index grouped by verb — see what you could cook,
add a recipe, shop for it — over one long page, book first: for a collection the index *is* the
product. **Three ways in, one approval** — type it, ask Claude, paste a link — and **nothing is
written until Keep it.**

**Three tables, all in `cookbook` and nowhere else**, their reasoning in the migration headers.
`recipes` stores **the whole pot** and derives the serving; `grocery_items` is this app's own list;
`brand_preferences` is the new one. **`macro_source` has two values where Health's has three** — no
`web`, so a number lifted off a page is not storable rather than merely not written.

**Name collisions are refused by the database**, not by a lookup — `recipes_name_key`, with
`tests/recipes.test.ts` holding the index and `normalizeName` in step.

**The list is the cheap version and that is a decision, not a gap.** Copied text or a King Soopers
link — no credential, no OAuth, no `middleware.ts` change; remembered brands change the link, not
that rule. Tidy is one Haiku call and `validateTidy` refuses a proposal that drops or doubles a line.
**Pricing helpings is browser arithmetic**; **logging what you ate is absent** — item 22, the TD's.

**`lib/models.ts` stays a per-app copy — settled in `DECISIONS.md`, no ledger row.** **Your board URL
is in `KICKOFF.md` on `main`.** **The livery is borrowed** — `clark` is the editor's, item 24.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, no per-query override. Health's
  `/list` is live and **stays Health's** until item 23 is sequenced; do not assume a date.
- **A failed read must never render as an empty book or list.** Both read as "nothing here", the
  opposite of what happened. `LookupError` → 503, and the client leaves its state `null`.
- **"Invalid API key" here is Supabase, not Anthropic.** Reading the book or the list calls no model;
  only `/api/recipes/draft` and `/api/grocery/tidy` hold an Anthropic key. It cost a wrong turn once.
- **A page that could not be read is refused twice**, and the second check is the one that matters:
  the importer rejects a page claimed as read that produced no ingredients. A slug alone invents a
  convincing chilli and you would cook it.
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
