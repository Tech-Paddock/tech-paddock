# Cookbook — handoff

State as of 2026-09-25.

`RULES.md` has the charter. This file is only what is true right now, and its traps. **Open work is
in Linear under `agent:Cookbook`** — never here.

---

## What is true now

**Surface.** A site whose two tabs are the verb index — Recipes and King Soopers list — each one long
page. **Each tab has an address: `/` is the book, `/list` is the list** (TEC-22). Both routes render
`app/Shell.tsx`; switching tabs replaces the address rather than navigating, so nothing on screen is
lost and a reload lands on the tab it names. Signed out, `/list` goes through `/login?from=/list` and
back. **Adding sits on top of both tabs**, collapsed on Recipes. Results are toasts (`app/Toast.tsx`);
a failed read stays inline. **Tab icon only, no home-screen install** — the icon is No. 12, the
roundel on the car from above, Joel's pick on 2026-09-23; **its colours are exact and fixed, dark
mode included**, and there is no dark variant.

**Four ways in** — type it, ask Claude, from a link, from a file. **Nothing a model wrote is saved
until Keep it; the typed path saves straight away.** A file is read then priced and **never
stored**; it lands `imported` with no `source_url`, refused twice when illegible, like a link.

**Three tables, all in `cookbook`**, reasoning in the migration headers. `recipes` stores **the whole
pot** and derives the serving; `grocery_items` is this app's list; `brand_preferences` is the third.
**`macro_source` has two values where Health's has three** — no `web`, so a lifted number is not
storable rather than merely not written. **A duplicate recipe name or brand phrase is refused by a
unique index.** `brand_preferences` held **zero rows** on 2026-09-23; the seed has not arrived
(TEC-51).

**The list is the cheap version and that is a decision, not a gap** — reconfirmed by Joel 2026-09-21.
Copied text or a King Soopers link; no credential, no OAuth, no `middleware.ts` change, and a
remembered brand changes the link, not that rule. **A substitution policy and delivery-vs-pickup are
Kroger account settings, not this app's.** Tidy is one Haiku call and `validateTidy` refuses a
proposal that drops or doubles a line. **Clear empties everything and asks first** — no undo.

**The grocery move (TEC-15).** Cookbook's list is live at `/list`; Health's `/list` is live too and
**stays Health's until its redirect ships (TEC-23)**. The TD drops `health.grocery_items` after that.

**Logging what you ate is not built here, by design.** Health prices a meal by reading Cookbook over
the contract in `RULES.md` (TEC-11); Cookbook never writes a log.

**`methodSteps` splits a method on numbered markers only** — why, and what it refuses, is in its tests.

**`lib/models.ts` is the third copy of Coffee's model registry**, flagged rather than shared; whether
it moves to `packages/shared` is the TD's call.

## Traps specific to this area

**Durable traps are in `DECISIONS.md`** — empty-vs-unread, the Supabase key, unconfigured `lint`.

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, with no per-query override.
- **`/list` is a path another app depends on.** Health's redirect names
  `https://cookbook.techpaddock.io/list`; `tests/tabs.test.ts` holds it. Renaming it is a
  cross-app change, not a refactor.
- **A page that could not be read is refused twice** — `RULES.md` has it in full, including why.
- **The re-estimate guardrail was reconsidered and kept.** Joel weighed dropping it on 2026-09-22
  and chose not to; an import never keeps a page's numbers. Do not re-ask.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the project
  and the domain did not exist; **both already did**. The dashboard is the record, never a checklist.
- **`claude/health-recipes` is kept on purpose** as the design record. `claude/cookbook-feedback-fixes`,
  `-from-a-file` and `-icon` are merged history awaiting deletion: never build on or revive them.
