# Cookbook — charter

**Written as a draft** on 2026-09-20 per `STANDUP.md` step 1 — the design conversation with Joel, in
a session that was not yet an agent — and **carried through the rest of the protocol unchanged** by
the technical director on the same day. Everything below the line is as that session wrote it. Only
the heading above and the *Not yet true* section at the end were touched, because the standup is
what made them false.

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

**Settled today (2026-09-20), at standup, in this session:**

- **Name: Cookbook.** "Recipe" stays Coffee's word — a brew, not a dish — which is why the newcomer
  was renamed rather than the incumbent.
- **Its own app, its own Postgres schema** (`cookbook`).
- **Surface: site.** A cookbook is a collection; the index is the product — you arrive to see what
  you could cook, which answers `SURFACE.md` question 2 plainly. Thin index grouped by verb, one
  long page, not thumb-first, no home-screen install.
- **The grocery list moves here.** You shop from recipes, not from what you ate, so a list built
  from Cookbook's own ingredients belongs beside the book rather than beside the log. **This is a
  decision about where it ends up, not a migration plan** — see *The grocery list* below for what
  that actually requires and who plans it.
- **Health reads Cookbook to price a meal. Health does not own recipes.** The read is a cross-app
  contract, and per `CLAUDE.md` it is the technical director's to design — not this charter's to
  invent by writing an API shape here.

---

## What this tool is

A recipe book, reached by three ways in — **one approval covers all three**:

1. **Type it.** You write the recipe; the model only prices it.
2. **Ask Claude.** You describe what you feel like; it writes one, then prices what it wrote.
3. **From a link.** It reads the page, then prices what it read — never what the page published.

All three land as a **draft**. The draft is not the book. Keeping it is the write.

From the book: **log a serving** (by tapping a recipe or dictating "two servings of my chilli" —
the parse and the price are Cookbook's; the log entry belongs to whichever app records what was
eaten, per the cross-app contract below), **add its ingredients to the grocery list**, or
**remove** it — which takes the recipe out and leaves anything already logged elsewhere untouched.

## What it stores

Its own schema, `cookbook`, empty until this charter is approved and scaffolded — the tables are
this agent's to design in full, the same way Health's were, not pre-empted here. Two are already
implied by the settled decisions above and should not need reinventing:

- **Recipes.** Store the whole pot; derive the serving — dividing is the lossless direction, and
  keeps "I got eight bowls, not six" a cheap edit. **Macros are static**, per Joel on 2026-09-18
  against Health's own recommendation that they be derived from linked ingredient rows: *"Recipes
  would have static macros."* So ingredients are text, not a join, and re-costing a recipe means
  estimating it again, on purpose. Carry `estimate` / `web`-style provenance and `source_url` from
  the health-recipes design, and keep the same meaning: `source_url` records where the *method*
  came from, never where a number did — imported nutrition is never retained, only re-estimated.
- **The grocery list.** Lines, ticked off, a `source` distinguishing a recipe-pushed ingredient from
  something added by hand. Health's `/list` shipped the cheap version of this on Joel's word — no
  stored credential, no OAuth, text or a link only — and that constraint carries over rather than
  being reopened for the move.

**Never another app's schema.** `lib/supabase.ts` pins `cookbook`; there is no default to override
per query. This tool never reads or writes `health.*` directly — what it exposes to Health is
through the contract the TD designs, not a cross-schema query.

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
  tidying the list (if this tool keeps that feature) stays a deliberate tap, never something that
  happens to the list as a side effect of adding to it.

## The grocery list — what "moves here" actually requires

**Not built in this draft.** Health's `/list` is live, reachable, and (per Health's own handoff)
the only screen besides the log itself. Moving its ownership to Cookbook is a schema and data
question, not just a feature to add:

- Per `CLAUDE.md`, a destructive change splits into two pull requests — stop using it, ship; drop it
  once that is live. Retiring Health's `grocery_items` table the moment Cookbook's exists would be
  the wrong order if anything is ever logged into it first.
- It touches Health's charter and code, which is not this agent's to edit.
- **This is the technical director's to sequence**, alongside the read contract below — both are
  cross-app, and both belong in the same conversation rather than two uncoordinated ones.

Until that happens, Cookbook may build its own grocery list against its own schema from day one;
what it must not do is assume Health's `/list` disappears on any particular date, or write to
`health.grocery_items`.

## The Health↔Cookbook contract — explicitly not this charter's to invent

Health prices a meal by reading Cookbook. What that read looks like — an endpoint shaped like the
tracker's `/api/summary`, a shared schema grant, something else — is the technical director's call,
the same way the hub's glance and the tracker's contracts are. **This charter does not propose a
shape for it.** Building ahead of that design risks shipping the wrong contract and having to
change it under a live dependency, which `CLAUDE.md`'s migration rule exists to avoid.

---

## Open questions, and whose they are

- **The grocery list migration's shape and order** — technical director.
- **The Health↔Cookbook read contract** — technical director.
- **The recipe table design in full** — this agent's, once scaffolded, the same way Health's
  `health.*` tables were left to Health rather than pre-empted at standup.

## What the standup left, and what it did not

**In the repo, all done:** the folder at `apps/cookbook`, the `cookbook` schema and its grants, a
kickoff block, both rows in `CLAUDE.md`, `.env.example`, `/api/health`, and the shared files stamped
from `packages/shared`. `app/page.tsx` is a placeholder that says it is one — **the screen is this
agent's to design, and the tables before it.**

**Outside the repo, Joel's and without an undo:** the Vercel project `tp-cookbook` with its Root
Directory, its environment variables (`SESSION_SECRET` **byte-identical** to the others), the
`cookbook.techpaddock.io` DNS record, **the exposed-schemas list in the Supabase dashboard**, and a
redeploy afterwards because Vercel bakes the environment in at build time. Until those run this app
is scaffolded but not reachable, and `/api/health` is what says which step is missing.

**Still not this agent's, and still the technical director's:** the Health↔Cookbook read contract
and the grocery-list move, TEC-11 and TEC-15.
