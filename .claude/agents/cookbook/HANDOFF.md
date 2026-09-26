# Cookbook — handoff

State as of 2026-09-26.

`RULES.md` has the charter. This file is only what is true right now, and its traps. **Open work is
in Linear under `agent:Cookbook`** — never here.

---

## What is true now

**Surface.** A site whose two tabs are the verb index, each one long page. **`/` is the book, `/list`
is the King Soopers list** (TEC-22); both render `app/Shell.tsx`, and switching tabs replaces the
address. Signed out, `/list` goes through `/login?from=/list` and back. **Each tab opens on its add
box** — "Add a recipe" collapsed, "Add items" open. Results are toasts; a failed read stays inline.
**Tab icon only, no install** — No. 12, Joel's pick; **its colours are fixed, dark mode included.**

**Four ways in** — type it, ask Claude, from a link, from a file. **Nothing a model wrote is saved
until Keep it; the typed path saves straight away**, after a name check that spares it a pricing
call it could not keep. A file is **never stored**. **An import is refused three times**: `read:
false`, no ingredients, or **no fetch that returned a page** (`lib/fetchRun.ts`). **"Something else"**
on a Claude draft re-asks with every draft turned down, plus an optional reason (`lib/reroll.ts`).
**Bin it is a turn-down too** (Joel, 2026-09-25). The pile is browser state: Keep it clears it,
and so does "Work it out" on a new brief; the same brief keeps it.

**Model requests come from `requestShape` in `lib/models.ts`**: Sonnet 5 gets an explicit effort and
thinking headroom, Haiku 4.5 gets no effort (it 400s). The four calls without a tool send a JSON
schema; every call checks `stop_reason`. Tidy sends line numbers, not UUIDs.

**Four tables in `cookbook`**, reasoning in the migration headers. `recipes` stores **the whole pot**;
`grocery_items` is this app's list; `brand_preferences` is unseeded (TEC-51); `menu` is **On the
menu** — left of the book on a wide screen, above it on a phone: one row per recipe, put there only
by *Add to list*, shown for seven rolling days and never deleted by time; ✕ removes the row only, and
removing the recipe cascades. **A list line carries the names of the recipes it came from**
(`grocery_items.recipes`, a snapshot; Tidy unions them); older lines say "from a recipe". **`macro_source`
has no `web`**, so a lifted number is not storable; **a duplicate name is refused by a unique index.**

**Recipe metadata (TEC-52) sits flat on `recipes`**, and **`lib/metadata.ts` reads it** off a model,
a request or a row alike. `meal` and `diet` are check-constrained lists its tests hold to `MEALS` and
`DIETS`; the rest is open lowercased text. **No free-of or allergen claim and no macro tag is
storable** — `readMeta` drops them; a macro filter is computed from the numbers. **The rating is
Joel's**: read only off this app's forms (typed, a draft before Keep it, the stars, the editor); a
model's is discarded. **Every field of a kept recipe is editable** (`lib/edit.ts`): only changed
ingredients re-price (one call, before the one write; a failure writes nothing); servings re-divides. Older rows read "not set" until a backfill
Joel approves. The pill always shows rating and time; meal · main · cuisine only when wide.

**The list is the cheap version and that is a decision, not a gap** — reconfirmed by Joel 2026-09-21:
copied text or a King Soopers link, no credential, no OAuth. **A line's name is its link**; the
checkbox is a separate tap target. "Milk — the small tin" stores a name and a note, and only the
name is searched. **Remembering a brand happens only in Your brands** (TEC-39): *Item*, then *this
exact product* (with **Paste**, King Soopers product pages only) or *better search words*. **`plain`
is refused by the editor and by Paste a batch**; the enum and `resolveLink` still honour old rows.
The editor sends no brand or note, and **a field not sent is not overwritten**. The `brand` column is
unused. Tidy is Haiku; `validateTidy` refuses a proposal that drops, doubles or invents a line.

**`GET /api/servings` is a contract** (TEC-11, one home `RULES.md`): every recipe per serving,
Cookbook dividing, unrounded, behind the ordinary session. `tests/servings.test.ts` holds its exact
fields; metadata never enters it. **Logging what you ate is Health's**, by design.

**Every failure has one status, in `lib/errors.ts`**: `LookupError` 503 means only that the database
did not answer; `InputError` 400; `ConflictError` 409; anything else 500, via `lib/respond.ts`.
**Health reads a 503 as "couldn't reach the Cookbook"**, so a `LookupError` for bad input looks
like an outage there.

**`methodSteps` splits only on the next number in a run** — gas mark 4 stays put (its tests hold the
edges). **`lib/models.ts` is the third copy of Coffee's model registry**, flagged rather than shared.

## Traps specific to this area

**Durable traps are in `DECISIONS.md`** — empty-vs-unread, the Supabase key, unconfigured `lint`.

- **`/list` is a path another app depends on** — Health's redirect (TEC-23) names it, and Health's
  own `/list` stays live until then; `tests/tabs.test.ts` holds it. Renaming it is cross-app.
- **The unread-page refusals and the re-estimate guardrail are settled** (`RULES.md`; the latter
  reconsidered and kept by Joel, 2026-09-22). Do not thin the checks or re-ask.
- **A client component must not import a lib file that imports `supabase.ts`** — a pure helper the
  browser needs gets its own file, as `lib/kingsoopers.ts` does.
- **Read Vercel and Supabase live before writing a deployment step** — #159 said two things did
  not exist that already did.
- **`claude/health-recipes` is the design record, kept on purpose.** Never revive a merged
  `claude/cookbook-*` branch.
