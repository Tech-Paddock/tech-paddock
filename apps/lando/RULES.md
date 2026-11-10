# Lando — rules

A puppy journal: log what Lando did, when, and who saw it; show what's due next.

## Scope

- Potty, food, fun, training (both stored as exercise), weight and health (vet visits, medical issues, medications and vaccines, TEC-259), with photos and files on every form and upcoming item (TEC-203), each logged through a short form with defaults; analytics over the same events; and notes (misc notes and documents, TEC-204), which a Health or Training entry can link to (TEC-208).
- Who logged it is a person picked from names stored in the database, never in the repo.

## Surface: app

- Five tabs, Log, Calendar, Notes, Analytics and Patch notes, opening on Log: the owner's override (2026-10-20,
  widened 2026-10-27 TEC-182, narrowed 2026-11-01 TEC-199, pills restored 2026-11-02 TEC-202, Notes added 2026-11-02 TEC-204, Calendar added 2026-11-08 TEC-234) of the app surface's one screen and no
  tabs. One-handed, thumb-first. Pills open a quick log: Pee and Poop open Potty on that pick, Meals opens Food, Fun opens Fun (TEC-181, TEC-186, restored TEC-202). The Log buttons are Treats, Training, Weight and Health.
- An app bar over the tabs: theme, logout and the livery badge (Meals today left, TEC-193).
- Quiet secondary controls (owner, TEC-250): Next 7 days is one short line per plan with a
  Calendar link; Treats is a plain counter, and Medical issue is its own checkbox, on Potty only;
  attachments are one small Attach link with thumbnails in a row.
- Every form's bottom row is When and Logging as, each half the row (owner, TEC-261): a date box
  that opens the calendar from a tap anywhere on it, and one time box whose hour, minute and AM/PM
  scroll in place. Weight is a date only, and a note is never in the future. The row opens on now,
  or on the entry's own time (a correction, a Done, an Add a plan). Save is on its own line below:
  one tap saves at that time and nothing opens after it. A future time shows the form's Repeat and
  "Future: saves as upcoming", and Save reads Save plan. A failed save keeps the chosen time.
- One field class (owner, TEC-255): every text box, number box and select has the same padding, a
  44px height and a fixed width, never one taken from its content. The default is half its section;
  a full-width field has a stated reason (the Note). Save is 44px tall and only as wide as its label.
  On Potty, Where is on its own line under What (TEC-263). On Food, Servings is the left box at about
  its label's width and What takes the rest of the row, wider than half because it holds a food's name.
- Next 7 days sits in a box under the Log tab's Logging as row, above the Feed (TEC-255, TEC-263).
- On a form, Training's Related note shares a line with Treats; a vet visit's and a medication dose's
  Related issue and Related note sit side by side. The Meals pill shows the count only, never cups
  (TEC-252).
- A Meal's and a Snuffle mat's amount is a Servings select in halves, ½ to 4, at a fixed width, and
  is stored with unit `serving`; a treat keeps its own count, and older meals keep their cups (owner,
  TEC-257). A new Meal opens on 1 serving and a new Snuffle mat on ½; the last amount is not
  remembered (TEC-263).
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
- Vaccines (owner, TEC-259): a vaccine is a Health entry, `type: vaccine`, from a fixed list (DHPP,
  Bordetella, Leptospirosis, Rabies) that widens only when the owner asks; `lando.details_ok` holds the
  same list. Vaccines given on a vet visit are separate Vaccine entries linked to the visit by
  `parent_id`, never fields inside the visit. Saving a vaccine offers its next dose as an upcoming plan
  on a suggested date from one pure lib, and the date stays editable.
- Livery: McLaren '25 (`mcl39`), the theme's own; changed only in the theme.
- Every change a user would notice adds one plain-language entry to the release notes
  (`lib/releases.ts`, newest first, append-only) on the same branch: no issue numbers, file names,
  jargon or real names (TEC-182).
- Every stored id or list value is history's key: the food catalogue (the code list plus foods
  added in the app, `lando.foods`, TEC-191), medications added in the app (`lando.medications`,
  TEC-199; a dose holds the id and a name snapshot), health reason ids, vaccine ids, `lando.dogs` ids, `COMMANDS`, and the potty what, leash and spot lists. Retire one (a food
  item: `retired: true`); never delete or re-id it, because old entries hold it. `lando.details_ok`
  only ever widens: `create or replace` re-checks no rows.
- Photos and files (on every entry and upcoming item, any type, TEC-203) live in the private `lando-photos` bucket,
  shown through signed URLs; a picture is shrunk on the phone and any other file is 4 MB at most; an event stores
  the path, and a file's original name.
