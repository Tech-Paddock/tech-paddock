# Lando — rules

A puppy journal: log what Lando did, when, and who saw it; show what's due next.

## Scope

- Potty, food, fun, training (both stored as exercise), weight and health (vet visits and medical issues, with photos), with photos on Potty, Fun and Training too, each logged through a short form with defaults; analytics over the same events.
- Who logged it is a person picked from names stored in the database, never in the repo.

## Surface: app

- Two tabs, Log and Analytics, opening on Log: the owner's override (2026-10-20) of the app
  surface's one screen and no tabs. One-handed, thumb-first.
- An app bar over the tabs: theme, logout, Meals today and the livery badge.
- Every form opens as a bottom sheet.
- Installable through `/app.webmanifest`.

## Never

1. Rewrite an entry. Corrections and deletes are new events that void the old one; history is append-only.
2. Put real names in the repo. Photos and vet records live in the database and storage only, never the repo. Fixtures are invented.
3. Read or write another tool's schema. `lib/supabase.ts` pins `lando`.
4. Call a model. A weekly summary would be its own issue, through a new `lib/models.ts` (Sonnet 5.5
   at medium) with its own test.
5. Lose a tap. A failed save stays on screen with a retry; it never shows as logged.
6. Replace or delete a stored photo (the owner, 2026-10-26, TEC-162). Entries name photos by path,
   voided ones too, so what is stored under a path is history like the entry.

## Settled

- Login is the shared password until per-person logins ship (TEC-118).
- Livery: McLaren '25 (`mcl39`), the theme's own; changed only in the theme.
- Every stored id or list value is history's key: the food catalogue (fixed in code), health reason
  ids, `lando.dogs` ids, `COMMANDS`, and the potty what, leash and spot lists. Retire one (a food
  item: `retired: true`); never delete or re-id it, because old entries hold it. `lando.details_ok`
  only ever widens: `create or replace` re-checks no rows.
- Photos (on Health, Potty, Fun and Training entries) live in the private `lando-photos` bucket, shown through
  signed URLs; an event stores only the path.
