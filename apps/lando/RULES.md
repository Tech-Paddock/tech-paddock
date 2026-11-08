# Lando — rules

A puppy journal: log what Lando did, when, and who saw it; show what's due next.

## Scope

- Potty, food, fun, training (both stored as exercise), weight and health (vet visits, medical issues and medications), with photos and files on every form and upcoming item (TEC-203), each logged through a short form with defaults; analytics over the same events; and notes (misc notes and documents, TEC-204), which a Health or Training entry can link to (TEC-208).
- Who logged it is a person picked from names stored in the database, never in the repo.

## Surface: app

- Five tabs, Log, Calendar, Notes, Analytics and Patch notes, opening on Log: the owner's override (2026-10-20,
  widened 2026-10-27 TEC-182, narrowed 2026-11-01 TEC-199, pills restored 2026-11-02 TEC-202, Notes added 2026-11-02 TEC-204, Calendar added 2026-11-08 TEC-234) of the app surface's one screen and no
  tabs. One-handed, thumb-first. Pills open a quick log: Pee and Poop open Potty on that pick, Meals opens Food, Fun opens Fun (TEC-181, TEC-186, restored TEC-202). The Log buttons are Treats, Training, Weight and Health.
- An app bar over the tabs: theme, logout and the livery badge (Meals today left, TEC-193).
- Every form opens as a bottom sheet.
- Installable through `/app.webmanifest`.

## Never

1. Rewrite an entry. Corrections and deletes are new events that void the old one; history is append-only.
2. Put real names in the repo. Photos and vet records live in the database and storage only, never the repo. Fixtures are invented.
3. Read or write another tool's schema. `lib/supabase.ts` pins `lando`.
4. Call a model. A weekly summary would be its own issue, through a new `lib/models.ts` (Sonnet 5.5
   at medium) with its own test.
5. Lose a tap. A failed save stays on screen with a retry; it never shows as logged.
6. Replace or delete a stored photo or file (the owner, 2026-10-26, TEC-162). Entries name photos by path,
   voided ones too, so what is stored under a path is history like the entry.

## Settled

- Upcoming items are plans kept in `lando.upcoming`, created by a future When on any form (no
  tab), edited in place while open (one made from a form, TEC-203), cancelled and never deleted; the journal stays append-only, and an entry saved from a Done
  links the item it closed (`done_event`) (TEC-192, TEC-199).
- Login is the shared password until per-person logins ship (TEC-118).
- Notes are a journal kind (`note`) on their own tab, never in the Log feed, the pills or Analytics;
  a note is never dated in the future (TEC-204).
- The Calendar reads the journal and `lando.upcoming` as they are, with no table of its own; it
  never shows notes, and offers Add a plan only from today onward (TEC-234).
- Related issue (TEC-142, TEC-161, TEC-208): Potty keeps its Medical issue checkbox, the select behind it. A vet
  visit and a medication dose show the select always, opening on None, which saves no `issue`. A medical issue
  links to no other issue.
- Related note (TEC-208): every Health type and Training carry an optional link (`note_id`) to a live note, picked
  from None and the newest notes. Changing or clearing it is a correction; the link never shows in the Log feed,
  the pills or Analytics.
- Livery: McLaren '25 (`mcl39`), the theme's own; changed only in the theme.
- Every change a user would notice adds one plain-language entry to the release notes
  (`lib/releases.ts`, newest first, append-only) on the same branch: no issue numbers, file names,
  jargon or real names (TEC-182).
- Every stored id or list value is history's key: the food catalogue (the code list plus foods
  added in the app, `lando.foods`, TEC-191), medications added in the app (`lando.medications`,
  TEC-199; a dose holds the id and a name snapshot), health reason ids, `lando.dogs` ids, `COMMANDS`, and the potty what, leash and spot lists. Retire one (a food
  item: `retired: true`); never delete or re-id it, because old entries hold it. `lando.details_ok`
  only ever widens: `create or replace` re-checks no rows.
- Photos and files (on every entry and upcoming item, any type, TEC-203) live in the private `lando-photos` bucket,
  shown through signed URLs; a picture is shrunk on the phone and any other file is 4 MB at most; an event stores
  the path, and a file's original name.
