# Lando — charter

A puppy journal: log what Lando did, when, and who saw it; show what's due next.

## Scope

- Potty (pee, poop, accident), meals, treats, training sessions, weight; a growth chart from weights.
- App surface: one screen, one-handed, opens on the since-last clocks and log buttons.
- Who logged it is a person picked from names stored in the database, never in the repo.

## Never

1. Rewrite an entry. Corrections and deletes are new events that void the old one; history is append-only.
2. Put real names, photos or vet records in the repo. Fixtures are invented.
3. Read or write another tool's schema. `lib/supabase.ts` pins `lando`.
4. Call a model in v1. A weekly summary later is a separate step with its own test.
5. Lose a tap. A failed save stays on screen with a retry; it never shows as logged.

## Settled

- Login is the shared password until per-person logins ship (TEC-118).
- Livery: `clark` for now (freed by the editor's retirement); a papaya livery is a later home theme change.
