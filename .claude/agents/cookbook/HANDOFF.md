# Cookbook — handoff

State as of 2026-09-20.

`RULES.md` has the charter. This file is only what is true right now.

---

## In flight

**Nothing, and you are on day one.** The standup scaffolded this area; nobody has built in it yet.

## What is true now

**`apps/cookbook` exists and deploys.** Next.js, the password gate, `/api/health`, and a placeholder
`app/page.tsx` that says it is a placeholder. **The five shared files are stamped from
`packages/shared`** — `auth.ts`, `password.ts`, `theme.css`, `theme.ts`, `next.config.mjs`. **Do not
edit a copy**; edit canonical and run `node scripts/stamp-shared.mjs`.

**The `cookbook` schema exists and is deliberately empty.** Two migrations shipped with the
scaffold: the schema, and its grants — a new schema inherits no grants at all, and the failure looks
like a bad key rather than a permissions problem. **The tables are yours to design**, and the
charter says which two are implied without designing them for you.

**Surface is settled: site.** Thin index grouped by verb, one long page, not thumb-first, **no
home-screen install** — which is why this app's layout carries no `appleWebApp` metadata and no
apple-touch-icon, unlike Health's and Coffee's. The reasoning is in `.claude/SURFACE.md`.

**The livery is borrowed and is not yours.** `clark` is the editor's; there are five liveries and
seven apps. TechPad Gen owns the fix — ledger item 24.

## Traps specific to this area

- **Never write to `health.*`.** `lib/supabase.ts` pins `cookbook` and there is no per-query
  override. What this tool exposes to Health goes through a contract the technical director
  designs — ledger item 22 — not a cross-schema query.
- **Health's `/list` is live and its grocery table is Health's.** Build your own list against your
  own schema if you want one, but **do not assume Health's disappears on any date** — that move is
  a two-pull-request destructive change and it is item 23, the TD's to sequence.
- **An import never keeps a page's published numbers.** Throw them away and re-estimate; an imported
  recipe reads `estimate`, never `web`. `source_url` records where the *method* came from.
- **A page that could not be read is refused, enforced twice** — the prompt requires `read: false`,
  and the importer independently rejects a page claimed as read that produced no ingredients. A slug
  alone is enough to invent a convincing recipe, and you would actually cook it.
- **The exposed-schemas list in the Supabase dashboard is outside this repo.** If `/api/health`
  reports a permissions failure against `cookbook`, check that list before suspecting the key. It
  cost `coffee` an hour on 2026-09-12.

## Next

**Design the tables before you build the screen.** That is the order Health was given and it is the
one that worked. Start from the charter, then read #151's *Why* section and its closing comment on
`claude/health-recipes` — **1,624 lines of design that exist nowhere else**, and that branch is kept
on purpose rather than deleted.

**You have no board URL yet.** Until Joel pastes one into your kickoff block, deliver the three-part
sign-off in chat and say out loud that it is in chat because there is no URL. Do not publish to a
new page.
