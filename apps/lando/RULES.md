# Lando — charter

A puppy journal: log what Lando did, when, and who saw it; show what's due next.

## Scope

- Potty, food, exercise and weight, each logged through a short form with defaults; analytics over the same events.
- App surface, by the owner's override (2026-10-20): two tabs, Log and Analytics, opening on Log; one-handed, thumb-first.
- Who logged it is a person picked from names stored in the database, never in the repo.

## Never

1. Rewrite an entry. Corrections and deletes are new events that void the old one; history is append-only.
2. Put real names, photos or vet records in the repo. Fixtures are invented.
3. Read or write another tool's schema. `lib/supabase.ts` pins `lando`.
4. Call a model in v1. A weekly summary later is a separate step with its own test.
5. Lose a tap. A failed save stays on screen with a retry; it never shows as logged.

## Settled

- Login is the shared password until per-person logins ship (TEC-118).
- Livery: McLaren '25 (`mcl39`), the theme's own; changed only in the theme.
