# Cookbook — handoff

State as of 2026-09-25.

`RULES.md` has the charter. This file is only what is true right now, and its traps. **Open work is
in Linear under `agent:Cookbook`** — never here.

---

## What is true now

**Surface.** A site whose two tabs are the verb index, each one long page. **`/` is the book, `/list`
is the King Soopers list** (TEC-22); both render `app/Shell.tsx`, and switching tabs replaces the
address. Signed out, `/list` goes through `/login?from=/list` and back. **Each tab opens on its add
box** — "Add a recipe" collapsed, "Add items" open. Results are toasts; a failed read stays inline.
**Tab icon only, no home-screen install** — icon No. 12, Joel's pick on 2026-09-23; **its colours
are exact and fixed, dark mode included**, with no dark variant.

**Four ways in** — type it, ask Claude, from a link, from a file. **Nothing a model wrote is saved
until Keep it; the typed path saves straight away**, after a name check that spares it a pricing
call it could not keep. A file is **never stored**. **An import is refused three times**: `read:
false`, no ingredients, or **no fetch that returned a page** (`lib/fetchRun.ts`).

**Model requests come from `requestShape` in `lib/models.ts`**: Sonnet 5 gets an explicit effort and
thinking headroom, Haiku 4.5 gets no effort (it 400s). The four calls without a tool send a JSON
schema; every call checks `stop_reason`. Tidy sends line numbers, not UUIDs.

**Four tables in `cookbook`**, reasoning in the migration headers. `recipes` stores **the whole pot**;
`grocery_items` is this app's list; `brand_preferences` held **zero rows** on 2026-09-23 (seed: TEC-51);
`menu` is **On the menu** — left of the book on a wide screen, above it on a phone: one row per
recipe, put there only by *Add to list*, shown for seven rolling days and never deleted by time; ✕
removes the row only, and removing the recipe cascades. **A list line carries the names of the
recipes it came from** (`grocery_items.recipes`, a snapshot; Tidy unions them); older recipe lines
still say "from a recipe".
**`macro_source` has no `web`**, so a lifted number is not storable. **A duplicate name or phrase is
refused by a unique index.**

**The list is the cheap version and that is a decision, not a gap** — reconfirmed by Joel 2026-09-21:
copied text or a King Soopers link, no credential, no OAuth. **A line's name is its link**; the
checkbox is a separate tap target. "Milk — the small tin" stores a name and a note, and only the
name is searched. **Remembering a brand happens only in Your brands** (TEC-39): *Item*, then *this
exact product* (with **Paste**, King Soopers product pages only) or *better search words*. **`plain`
is refused by the editor and by Paste a batch**; the enum and `resolveLink` still honour old rows.
The editor sends no brand or note, and **a field not sent is not overwritten**. The `brand` column is
unused. Tidy is Haiku; `validateTidy` refuses a proposal that drops, doubles or invents a line.

**The grocery move (TEC-15).** Health's `/list` **stays Health's until its redirect ships (TEC-23)**;
the TD drops `health.grocery_items` after that.

**`GET /api/servings` is a contract** (TEC-11, one home `RULES.md`): every recipe per serving,
Cookbook dividing, unrounded, behind the ordinary session. `tests/servings.test.ts` holds its exact
fields. **Logging what you ate is Health's**, by design.

**Every failure has one status, in `lib/errors.ts`**: `LookupError` 503 means only that the database
did not answer; `InputError` 400; `ConflictError` 409; anything else 500, via `lib/respond.ts`.
**Health reads a 503 as "couldn't reach the Cookbook"**, so a `LookupError` for bad input looks
like an outage there.

**`methodSteps` splits only on the next number in a run** — gas mark 4 stays put; the edges are in
its tests. `/api/health` probes the database with a one-row read of `recipes`.

**`lib/models.ts` is the third copy of Coffee's model registry**, flagged rather than shared.

## Traps specific to this area

**Durable traps are in `DECISIONS.md`** — empty-vs-unread, the Supabase key, unconfigured `lint`.

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook`, with no per-query override.
- **`/list` is a path another app depends on** — Health's redirect names it; `tests/tabs.test.ts`
  holds it. Renaming it is a cross-app change, not a refactor.
- **A page that could not be read is refused, in code** — `RULES.md` has why. Do not thin the checks.
- **The re-estimate guardrail was reconsidered and kept** (Joel, 2026-09-22). Do not re-ask.
- **A client component must not import a lib file that imports `supabase.ts`** — a pure helper the
  browser needs gets its own file, as `lib/kingsoopers.ts` does.
- **Read Vercel and Supabase live before writing a deployment step.** #159's body said the project
  and the domain did not exist; **both already did**.
- **`claude/health-recipes` is kept on purpose** as the design record. `claude/cookbook-feedback-fixes`,
  `-from-a-file` and `-icon` are merged history awaiting deletion: never build on or revive them.
