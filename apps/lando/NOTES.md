# Lando — notes

## State

- v2 on Next.js 16: four tabs under the app bar, **Log**, **Analytics**, **What's new** and **Upcoming**, sticky,
  opening on Log (RULES.md holds the owner's override of the one-screen rule).
- **Upcoming** (TEC-192): plans for vet visits, vaccines, medications and other things, in `lando.upcoming`
  (kind, title, due day, optional time and note, optional repeat of N weeks, months or years, status open,
  done or cancelled). The tab lists open items soonest first (`openItems`), each in the pills' status colours
  (`.lando-pill[data-status]`: due today to 7 days out is amber/`yellow`, overdue is `red`, the rest neutral;
  `upcomingTone`, by calendar day on the phone's day). The same first item is a one-line button under the
  pills on Log, "Next: Title · Fri Nov 6" (" · overdue" when red), absent when nothing is open; a tap opens
  the tab. Add and Edit use a bottom sheet (`UpcomingTab.tsx`); an item is edited in place and **cancelled,
  never deleted** (the row keeps `status`). Reads and writes go through `/api/upcoming`: `GET` the open items,
  `POST {action: add | edit | cancel | done}`. The journal read (`/api/journal`) is untouched; Upcoming loads
  beside it, and one failing never blanks the other.
  * **Done** on Medication or Other marks it done with today's date. Done on a **Vet visit or Vaccine** opens
    the Vet visit form (`visitPrefill`: the item's day and time, noon when none; a vaccine's reason is
    `vaccines`; a vet visit's reason only when the title says check-up or follow-up/recheck; the title is the
    note). Journal remembers the link (`visitLinks`, by the visit's id); once `/api/events` saves that visit,
    `saveThenClose` posts `done` with `done_event` set to the visit's id. Closing the form without saving
    never closes the item; a failed save keeps its Retry, and the Retry closes the item when it lands. The
    server also refuses to close a vet or vaccine item without a saved vet visit's id (`applyAction`).
  * **A repeat**: the server inserts the next open item at `nextDue` (weeks add 7 days each; months and years
    land on the same day, or the last day of a shorter month, so Jan 31 + 1 month is Feb 28/29), same kind,
    title, note, time and repeat. If that insert fails the item is put back to open so Done can be tried again.
  * No phone notifications (the owner's pick); the line on Log and the colours are the whole reminder.
- **Log** (TEC-186 made the pills the way in): four since-last pills in one row (Pee, Poop, Meal, **Fun**;
  label over value, the clock time in the title and for screen readers; coloured by TEC-142, below), then
  **four buttons in one row directly under them** (TEC-188: Treats, Training, Weight, Health, the pills' own
  grid and 44px height, so the same size; no "Log" heading; Weight keeps "7.3 lb" as a small second line,
  which fits at pill width, the date in its title), then "Logging as", then the **Feed** under a row of filter pills (TEC-171, below). **Potty and
  Fun have no button**: they are reached through the pills (Fun's own Pee and Poop, below) and by tapping a
  feed row. **Treats** opens the Food form on a treat (`TREAT_QUICK_LOG`; the Meal/Treat choice stays in the
  form, and the Food filter pill and the form keep the name Food). No growth chart on Log since TEC-129: it
  lives in Analytics only. Each button opens a bottom sheet (`app/Sheet.tsx`) with that form
  (`app/LogForm.tsx`, prop `form`), defaults filled in, so Save is usually the only other tap. Tapping a feed
  row opens the matching form on that entry to correct or delete it.
- **Health** (TEC-137, reworked by TEC-139): a sixth form, kind `health`, with a Type of **Vet
  visit** or **Medical issue**, then **one plain full-width `<select>`** of high-level picks
  (styled like Other dogs'), a required **Note** under it ("What happened?"), up to `MAX_PHOTOS`
  (6) photos, and the usual When and Human. Vet visit: Check-up, Vaccines, Sick or injured,
  Procedure (spay/neuter, dental), Follow-up, Other (`VET_REASONS`). Medical issue: Stomach &
  appetite, Skin, ears & eyes, Limping or injury, Breathing or cough, Energy or behaviour, Other
  (`ISSUE_PICKS`, both in `lib/events.ts`). A new entry opens on "Pick one…" and Save without a
  pick says so. Switching the Type keeps the pick only if the other list shares it ("Other").
  Stored shape: `{type: vet|issue, reasons[], photos?[], issue?: uuid}` (`issue` on a vet visit
  only, migration `lando_issue_links`), `reasons` an array of one for every new entry; the story is
  the event's own `note`. Feed: "Vet visit  Check-up · 2 photos"
  with up to four 40px thumbnails and the note after it; the chip is Health. Analytics and the
  since-last pills ignore it.
- **The Health note is required** (TEC-139), for a new entry and a correction alike: the phone
  blocks Save on a blank or whitespace-only note with "Say what happened — the note is required."
  and the server refuses it too (`parseNewEvent`, so `writeEvent`; a delete is exempt, and no
  other kind needs a note). An old Health entry saved without one therefore needs a note typed
  before its correction can save.
- **Retired Health reasons** (TEC-139): TEC-137's detailed ids (`VET_RETIRED`, `ISSUE_RETIRED`)
  are retired the way the food catalogue retires items: the form does not offer them, but
  `parseDetails` and `lando.details_ok` accept them, the feed labels them (`healthReasonLabel`),
  and a correction on an entry holding several reasons or a retired one opens the select on an
  extra option listing them (`HEALTH_KEPT`, `healthPickFor`, like `DOGS_KEPT`), saved unchanged
  until another pick is made. `checkHealthReasons` (called from `writeEvent`) makes the rule
  server-side: a new entry takes exactly one offered reason; a correction may also repeat the
  entry it replaces, same type and same set. `checkup`, `vaccines` and `other` are ids both
  generations share, so old entries with them read with the new labels ("Check-up", not
  "Wellness check-up"). Never delete a retired id or change an id.
- **Health photos** (TEC-137, Fun and Training since TEC-139, Potty since TEC-142): private Storage bucket `lando-photos` (migration
  `create_lando_photos_bucket`), written only by `POST /api/photos` with the service role and
  shown only through signed URLs; an event stores only the path, `health/<uuid>.<jpg|png|webp>`
  (`PHOTO_PATH`; the `health/` prefix stays for exercise photos too, one pattern, one bucket). The phone shrinks each photo through a canvas first (`lib/image.ts`, a local
  copy of Coffee's; 1568px, jpeg) and uploads it the moment it is picked (`app/Photos.tsx`, a
  local pattern: Take photo opens the camera, Choose photos the library). Each photo is
  uploading, failed (it stays on screen with Retry and ✕) or done; **Save is disabled until every
  photo is done**, and the server refuses an entry naming a path with no object behind it
  (`writeEvent` -> `missingPhotos`), so an entry never shows as saved without its photos. The
  phone chooses each photo's id, so a retry is the same object (the upload is not an upsert: see the photos trap). `GET
  /api/journal` returns `photos`, a path -> signed URL map for the live health, exercise and potty entries (an hour; `eventPhotos`);
  the screen adds each upload's URL as it happens, and a path that could not be signed reads "No
  photo" / "Photo unavailable", never a blank. A correction keeps the photos it does not remove
  and the voided entry keeps all of its own; a delete is a void. **Nothing is ever deleted from
  the bucket**, so a photo removed in a correction, discarded with an unsaved entry, or uploaded
  and abandoned stays there, unreferenced.
- **Pill status colours** (TEC-142). Each pill but Fun wears a status from how long ago its
  last event was (`pillStatus`, with the thresholds as named constants, all in `lib/events.ts`):
  **pee and poop** green under 1 h, yellow from 1 h up to and including 3 h, red over 3 h
  (`POTTY_YELLOW_MS`, `POTTY_RED_MS`); **food** green under 3 h, yellow from 3 h, red at 5 h or more
  (`MEAL_YELLOW_MS`, `MEAL_RED_MS`). Fun stays plain, and so does "none". The status is also in
  words, in the pill's `title` and in its screen-reader text (`PILL_STATUS_WORDS`: "green, recent",
  "yellow, getting long", "red, overdue"). The colour is a local pattern in `app/globals.css`, next
  to `--lando-series-*`: `--lando-status-green` and `--lando-status-yellow` (own values, one pair
  for light and one for dark) and `--lando-status-red` (the theme's `--danger`); `.lando-pill
  [data-status]` draws a 2px edge (border plus an inset ring, so no size change) and a 16% tint,
  with the ink text unchanged. Contrast, checked against the mcl39 tokens: each edge at least 4.4:1
  on both the surface and the paper in light and dark; ink on a tint at least 11:1.
  **The food clock is the last meal** (`sinceLast`): a treat no longer resets it (before TEC-142 a
  treat did). The pill is labelled **Meal** (TEC-181; `CLOCK_LABELS`); the Food button and form keep
  their name because they log treats too.
- **Tapping a pill opens a quick log** (TEC-181, Fun by TEC-186): the same form in the same bottom
  sheet, on a new entry, with When now and everything editable. The pill is one `<button>` (`Pill`
  in `Journal.tsx`); its title and screen-reader text end "tap to log". `quickLog` in `lib/events.ts`
  decides the prefill and `LogForm` takes it as `quick`: **Pee** and **Poop** open Potty with that
  what, the form's own Outside + Leashed (Time outside stays empty, TEC-176); **Meal** opens Food
  on the last meal's item and amount (`sinceLast`'s food clock, so never a treat), or the usual
  defaults with no meal in the read or an item the catalogue no longer lists. It ignores the
  remembered meal on purpose. **Fun** opens the Fun form on a new walk with its usual defaults. The pills
  are not tappable until the journal has loaded (the last meal is unknown before). Tests: `tests/quicklog.test.ts`.
- **The Fun clock** (TEC-186; the `exercise` clock id, labelled Fun in `CLOCK_LABELS`): the last live **walk or
  playtime** (`countsFor`); a training does not reset it. Plain, no status colour. Analytics still says exercise.
- **Fun's Pee and Poop buttons** (TEC-186), on the Fun form of a **new** entry only (not on a correction, whose
  time would be wrong, and not on Training): one tap saves a potty entry at once, no confirm. `at` is the tap,
  Human is the form's person, no note, no photos. **Where is inferred, purely, by `funPotty`**: a walk is outside
  and leashed (whatever Where shows); playtime outside is outside (no leash picked); playtime inside is inside,
  an accident (no spot picked); training gets none. It goes through the usual pending path
  (`Journal`'s `logPotty` -> `save`): the sheet **stays open**, a toast says "Pee logged", and the form lists
  each tap ("Pee logged 8:30 PM  outside · leashed") with Saving…, or Not saved + Retry (`unsaved`, `onRetry`), so
  a failed save is never shown as logged (RULES Never 5; it also sits in the feed with its own Retry). Each tap is
  its own entry, independent of whether the Fun entry is saved or the sheet is closed. Two taps are two entries.
  Tests: `tests/pillsway.test.ts`.
- **The meal gaps under the pills are gone** (TEC-172's second lines, removed by TEC-186, with `mealGaps`,
  `mealGapText`, `formatGap` and `tests/mealgaps.test.ts`). Meal-to-poop timing lives in Analytics only.
- **The app bar** (TEC-193, `app/AppBar.tsx`): the name, theme, logout and the livery badge. **"Meals today: N" is
  gone** (TEC-142's `Meals.tsx` context, `useReportMeals` and `mealsToday` with its tests were removed); the Meal
  pill already counts meals. The bar wraps rather than clips on a very narrow phone.
- **Related issue** (TEC-142), on **Potty** and on a **vet visit** (not on a medical issue), behind a
  **Medical issue** checkbox (TEC-161): unticked, the select is hidden and no `issue` is saved;
  ticked, a plain `<select>` of None and the newest 20 live medical issues, labelled by date and pick ("Oct 24 ·
  Stomach & appetite", `issueChoices`). Stored as an optional `issue` (the linked event's id) in
  details. A link is an id, and a correction creates a new event, so it is **resolved when read**
  (`resolveIssue`, pure): follow the `voids` chain to the live version; a chain that ends in a
  delete is `removed`; an id no event read holds is `unknown`. The feed reads "re: Stomach &
  appetite, Oct 24" (the live version's first pick and date), "removed issue" for a deleted one, and
  "re: earlier issue" for an unknown one (an issue older than the read's 30 days whose correction
  was not read). A correction with a stored link opens ticked on it and keeps it unless it is changed;
  unticking it and saving removes the link (a new event, as any correction);
  when the list would not show it (a superseded copy, a deleted or an old issue) `issueChoices`
  adds it as the first option, so an untouched correction saves it unchanged. The **server refuses a
  link to an id that is not a Health issue event** (`writeEvent` -> `checkIssueTarget`, the dogs
  check's twin), voided copies included, since an old link may name a superseded one. Changing
  an issue's pick or note never touches the entries that link to it.
- **A vet visit's Weight** (TEC-151), on **Vet visit** only (not Medical issue): an optional Weight
  and Unit under Related issue. A new visit opens it empty, in this phone's last weight unit
  (`remembered.unit`, else the newest weight's). A filled one is **its own ordinary weight entry**:
  local noon of the visit's day (`fromDateInput`, as every weight), the visit's person, no note, and
  `visit: <the visit's id>` in its details (`visitWeightPlan`, pure, in `lib/events.ts`). It shows in
  the growth chart and on the Weight button like any weigh-in, and as its own Weight row in the feed.
  The vet line also carries it: "Vet visit  Check-up · 7.6 lb" (`describe` -> `linkedWeight`).
  - **Saved after the visit**, the treats' pattern: the weight rides in the pending row's `then` and
    in `lando.unsaved` with it (`saveThen`, `lib/saveOrder.ts`, runs the visit and only then each
    follower). If the visit fails, its row reads "Not saved  + 7.6 lb": Retry saves both, ✕ discards
    both (`followText`), so no weight is logged for a visit that never saved. The weight then has its
    own row and its own Retry.
  - **Resolved when read**, like the issue link: the `visit` id may name a superseded copy, and
    `resolveVisit` / `linkedWeight` follow the `voids` chain to the live visit (a delete ends it as
    `removed`). Both share one walker (`followLink`) with `resolveIssue`.
  - **A correction** of the visit opens the field on its linked weight. Unchanged (same value and
    unit): nothing is saved, the link follows the correction by itself. Changed: the weight is
    **voided and replaced**, never a second one, the new entry's `visit` the corrected visit's *new*
    id, saved after the correction succeeds (if the correction fails the form stays open, nothing
    queued). Same day rule: the replacement sits at noon of the corrected visit's day, and keeps the
    old one's note. A **blank** field on a visit that has a weight is refused ("change it here, or
    delete that weight from the feed"): a measured weight is deleted from the feed, not by a blank box.
    Switching a corrected visit's Type to Medical issue leaves its weight where it was.
  - **Deleting the visit leaves the weight** (it was measured); it keeps its `visit` and resolves to
    `removed`. Correcting a linked weight from the Weight form keeps its `visit`.
  - **The server refuses** a `visit` that is not a vet visit event (`writeEvent` -> `checkVisitTarget`,
    the issue check's twin), a voided copy allowed.
- **Fun and Training** (TEC-136) replaced the Exercise button (and TEC-186 took both off the Log buttons: Fun is a pill, Training a button). Both save kind `exercise` with the
  existing `type`; the data shape did not change. `FORM_KINDS`, `kindOfForm` and `formOf`
  (`lib/events.ts`) map between the six forms and the five kinds: a walk or playtime is Fun, a
  training is Training. Fun's Type offers Walk and Playtime only (`FUN_TYPES`); Training has no
  Type and always has Commands practised.
  **Photos on both** (TEC-139): the same Photos block as Health (Take photo, Choose photos, upload
  on pick, Save waits for every photo, `missingPhotos` refuses an entry whose photo is not in the
  bucket), stored as an optional `photos` on the exercise details (1 to `MAX_PHOTOS`, same
  `PHOTO_PATH`; no key when none). Old exercise entries have none and stay valid. A correction
  keeps the photos it does not remove. A treat queued from Training carries none (`treatEntry`
  builds a food entry); the feed row shows the thumbnails and "2 photos" like Health. A correction opens the form its entry belongs to, so a
  walk cannot be corrected into a training or back. Pills and Analytics still say "exercise".
- **The feed** (TEC-136): every live entry in the read's window (today and the `HORIZON_DAYS`
  before it, the server's own cut; weights older than that stay in Analytics' growth chart) plus
  every unsaved row, grouped under a heading per phone-local day: "Today", "Yesterday", then a
  short date (`feedDays`). Newest first, days and rows, by **when it happened** (`at`, the When
  picked in the form), never by `created_at`; a weight orders at noon of its day
  (`happenedAt`), whatever time an older one was logged at, and shows no clock time (the heading
  is its day). Ties: unsaved rows first, then the later save. **A row is one line** (TEC-139): the title,
  detail and note run on one line and are cut off with an ellipsis (`truncate` on a `min-w-0`
  column), so a long note never wraps; the clock time, the person and the 40px thumbnails
  (`shrink-0`) keep their size. The whole text is the row's `title` and the entry one tap away. Unsaved rows sit in their day like
  any other, with Saving… or Not saved, Retry and ✕.
- **The feed's filter** (TEC-171, the owner's option B): **small outlined pills in one row that
  scrolls sideways**, so they cannot be mistaken for the Log tiles (big, orange, lipped). **All**
  first, then Potty, Food, Fun, Training, Weight, Health (`FORM_KINDS`), across every day. Unselected:
  1px `line` outline, soft ink, 13px; selected: filled `ink` with `ink-invert` text. Each
  `<button>` is the 44px-tall hit area and the pill is its inner span (the pill itself is about
  28px). `aria-pressed` on every button, All pressed when nothing is picked. **The filter is multi-select**
  (TEC-177): each form's pill toggles on its own and the feed shows the rows of every picked form (unsaved
  rows too); All clears the picks; picking all six reads as All (`toggleForm`, `inPicks`). Food covers meals
  and treats; Health covers vet visits and medical issues. Held in memory, not remembered. Empty reads
  "Nothing logged yet.", under one pick "No training entries yet.", under several "No entries yet for those."
  (`emptyFeedText`).
- **Feed colours** (TEC-177, owner: "Let's give the entire feed some color"). A **local pattern** in
  `app/globals.css`, beside `--lando-status-*`: `--lando-kind-*`, one hue per filter form, each with a light
  and a dark value (Potty blue, Food burnt papaya, Fun teal, Training purple, Weight slate, Health pink;
  Health is one colour for vet visits and medical issues). A row (`.lando-row`, `data-kind` from `feedTone`)
  keeps its ink text on a 16% tint of its colour with a 4px left edge of it; an unsaved row (dashed) wears its
  form's colour beside Saving… or Not saved. **An accident stays red** (`data-kind="accident"` uses
  `--lando-status-red`, the theme's `--danger`) over Potty's blue, with its red border and title. The filter
  pills carry a dot of the colour (`.lando-kind-dot`, `aria-hidden`), so they are the legend; colour is never
  the only cue, every title names its form. Contrast, against the mcl39 tokens (`tests/feedcolours.test.ts`
  computes it from the CSS): each edge at least 4.4:1 on the paper and the surface, light and dark; ink on a
  tint at least 11:1. Food's light burnt papaya is the nearest to the yellow status; the two never sit side
  by side. The Log buttons, Analytics and the day timeline keep their own colours.
- **A treat's amount is a plain whole-number box** (TEC-188, `app/TreatQty.tsx`, a digits-only text input with a
  numeric keypad, min 1, opens on 1), in the Food form when Type is Treat (opens on 1) and in the inline treat row on Potty and Training (opens on 0,
  below). Meals keep the scroller below. `treatQtyError` (`lib/foods.ts`) is the form's rule (a new treat: whole, 1 or
  more); a correction that never touched the box saves the amount it opened on, so an older treat holding a
  part of a piece (or none) is not forced to change. Stored shape and `parseDetails` are unchanged (the server
  still accepts any amount above 0). The What select and the amount sit in a grid with `items-start`, so What
  keeps a normal input height beside the scroller.
- **Food amount, for meals, is a scroll picker in ⅛ steps** (TEC-136, `app/AmountScroller.tsx`, a local
  pattern): **a small window, two rows tall (TEC-193)**: the pick in full with half of the amount above and half
  of the amount below peeking in, 88px wide at most (`lib/scroller.ts`: `SCROLLER_ROW` 32, `SCROLLER_WIDTH`,
  `scrollerWindow()` holds the height, the half-row padding and the band, and `tests/inlinetreat.test.ts` holds
  the window); it snaps a step at a time; one
  `spinbutton` for screen readers (arrows step, Page keys a whole unit, Home and End). It offers
  "—" (no amount, as before) and 1/8 up to `AMOUNT_PICKER_MAX` (20) (`amountOptions`). The stored
  bound is unchanged (above 0, at most 1000). An amount the form opened on that is not an eighth
  (an older 1/3) or is past 20, and a phone's remembered meal amount, are slotted into the list,
  so an untouched correction keeps them. Eighths read as fractions, reduced (`formatAmount`:
  "1/8", "3/8", "1 1/4"). Defaults unchanged: a treat opens on 1, a meal on this phone's last
  meal amount, or "—" on its first. The **Snuffle mat** (TEC-193, `lib/foods.ts`, id `snuffle-mat`, unit cup, no
  calories, before Misc) takes that same default: there is no per-item amount.
- **The inline treat row on Training and Potty** (TEC-193, replacing Training's "+ Treat" pop-up of TEC-136;
  `app/TreatRow.tsx`, one component for both forms): a treat pick (the code list plus foods added in the app,
  TEC-191, Misc last; opens on Misc) beside **Qty** (the whole-number box; **opens on 0**, which logs nothing).
  On Training it sits after Other dogs and before Commands; on Potty it sits right below Time outside, and in
  the same place for an inside potty (after Spot). Fun has no row and keeps its Length and Treats used boxes.
  On Save, a Qty of 1 or more becomes one food `treat` entry at the entry's exact `at` and Human
  (`inlineTreatEntries`, which calls `treatEntry`), saved **after** it; Qty 0 or empty saves none.
  - Its id is fixed when the form opens (`treatId`), so a retry is the same row.
  - New entry: the entry is a pending row carrying the treat (`then`, mirrored in `lando.unsaved` with it).
    Once it saves, the treat is saved as its own row with its own Retry. If the entry fails, its row reads
    "+ 1 treat" with Not saved: Retry saves the entry and then the treat; ✕ discards both, so no treat is ever
    logged for an entry that never was (`lib/saveOrder.ts`).
  - Closing the sheet without saving logs nothing. A failed correction keeps the form open, the row intact.
  - **Training's stored `treats` is a count of treat entries** (as before): a new training stores 1 when Qty is
    above 0, else 0; a correction stores the count it had plus 1 for a treat added now. The "Treats used" box is
    gone from Training (Fun keeps it); how many pieces is the treat entry's amount.
  - Deleting a training or potty leaves its treats: they were eaten. Delete one from the feed if it was not.
  - A correction (Training or Potty) shows the treats already logged with it ("Logged: …", `treatsWith`): live
    food treats at the entry's exact `at`, to the millisecond. There is no link column. Moving the entry's
    When in a correction leaves its treats at the old time (correct them from the feed), and they then no
    longer show on it. The row opens on 0 on a correction too, so nothing already logged is saved twice.
- **Training's layout** (TEC-193): Time (min) sits on the top row beside Inside/Outside, then Other dogs, the
  treat row, then **Commands practised**, a native multi-select over `COMMANDS` (a phone shows a checklist) with
  "Picked: Sit, Down" under it. The picks are stored exactly as before, filtered to the list's order
  (`parseDetails`). The `Chips` component is gone with it.
- **What's new** (TEC-182, plain text since TEC-186; `app/WhatsNew.tsx`): the third tab, after Analytics. **No
  cards.** Per day, a line "Oct 27 | a short summary of the day" (bold), then that day's entries as "•" bullets.
  It shows the newest `DAYS_SHOWN` (7) **whole days** (`shownDays`), newest first, never a day cut short. Data
  is in `lib/releases.ts`: `RELEASES` (a date `YYYY-MM-DD`, the day it went live, and one plain sentence a
  non-technical reader follows, newest first) and `DAY_SUMMARIES` (one line per date, keyed by it; a test
  requires a summary for every day with entries and none for a day without). Static text, no database, no
  fetch, no model. Older entries stay in the file; it is append-only like the journal.
- **Analytics** (`app/Analytics.tsx`, rebuilt by TEC-143; all aggregation is pure, in
  `lib/analytics.ts`, tested in `tests/timeline.test.ts`; no model call, no data change). The last 14
  local days, six cards,
  **except Day by day, which shows the last 5** (`TIMELINE_DAYS`, TEC-153, next to `ANALYTICS_DAYS`;
  `dayTimeline` builds its marks and counts from it, so the two always cover the same days; the
  owner's "for scatter plot only go back 5 days"). Time between pees, meal to poop, food against weight
  and the heading stay on 14 days, exercise on 4 weeks:
  - **Day by day** (`app/DayTimeline.tsx`): a row per day (5), newest first, hours 0-24 across (ticks
    12a 6a 12p 6p 12a). Potty marks on a top lane, food marks below; each kind has its own shape
    (`app/Glyph.tsx`: pee circle, poop square, accident triangle, meal diamond, treat plus) and a
    legend, so colour is never the only cue. Pee, poop, accident (inside), meal, treat; "No potty"
    is not plotted; both outside is a pee and a poop mark; inside is one accident mark, exactly as
    `perDay` counts (a test holds the two equal). Day totals at the row's end (potty trips with a
    triangle if any accident, then meals + treats). Marks within 0.9 h in one lane step aside
    (`stackLevels`). A row is one button: tap near a mark for that entry, anywhere else for the
    day's counts and every time, in words under the row. Local pattern: HTML rows with absolutely
    placed inline-SVG glyphs, not a scaled SVG, so shapes and text keep their size at 360px
    (checked at 360px, light and dark).
  - **Time between pees** (`app/DailyChart.tsx`, `peeGaps`): per day the average (dot) and longest
    (bar) gap. A pee is a pee or both, outside or inside (an accident is still a pee). **A gap is
    assigned to the day it ends on. A gap whose two pees fall on different local days is the
    overnight gap: it is shown on its own ("overnight" in the day's tap text, and the window's median in
    the card's summary) and is left out of the average and the longest**, so a night's sleep does
    not swamp the daytime numbers. The last pee before the window still anchors the first day's
    overnight. Fewer than two pees in a day means no daytime gap (blank, not zero).
  - **Meal to poop** (`mealToPoop`): minutes from each meal to the next poop (poop or both, outside
    or inside), only if within `MEAL_POOP_WINDOW_MS` (6 h); the median over the window, and per day
    a diamond per meal and a dot for the day's median. A meal with no poop in the window is left out
    and counted; a meal under 6 h old with no poop yet is "pending" (also left out). The poop may be
    on the next day; the meal's day owns the number. Treats are not meals.
  - **Food and weight** (`app/FoodWeight.tsx`, `foodAgainstWeight`): two panels on the same day
    columns, the day's weight (line) above the day's total meal amount (bars). Amounts only. Meals
    come in different units, so the **most common unit** among the window's meals with an amount is
    summed (a meal with no unit, Misc, is its own group; ties go to the unit that sorts first);
    meals in another unit and meals with no amount are left out and the card says how many. Weight
    is in the newest weight's unit, the day's last weigh-in; its axis is the window's own range,
    not from zero (the Weight card keeps the zero baseline).
  - **Weight** (`GrowthChart`, unchanged) and **Exercise per week** (`weeklyExercise`): minutes in
    rolling seven-day weeks ending today, **four weeks (28 days, inside the 30-day read) rather than
    the 14-day window**, as stacked Fun (walk, playtime) and Training bars with the numbers beside;
    leading weeks before the journal's first entry are dropped. The old per-day potty, food and
    exercise bar cards and `StackedBars` are gone.
- The design is the prototype artifact `https://claude.ai/artifact/XdiVZzBqyzeQEVxwXyqAfv`, built
  with the theme's tokens; its sample data and made-up history are not in the app.
- The gate file is `proxy.ts`, the base copy.
- Livery `mcl39` (McLaren '25: papaya on anthracite), worn by Lando alone.
- The icon is Lando in a racing helmet, visor down (`app/icon.svg`, concept A, the owner's pick),
  wearing "the blob" (TEC-124, the owner's ask): a neon lime shell (`#D7FF1E`, shaded `#A9CC00`)
  with a few thick black contour loops and squiggles (`#0E0F11`, stroke 18) clipped to the shell,
  and a small smiley in the right-hand loop. Drawn freehand in the spirit of the design, not traced
  or copied; no sponsor, team mark, wordmark or number. The visor is smoked anthracite at 0.35
  opacity with a highlight streak and a faint lime reflection, so his face reads through it. The
  dog is a hand-drawn vector of the real dog: a chocolate-dapple and white miniature dachshund
  with a white blaze, chocolate over both eyes, tan eyebrow dots and cheeks, amber eyes, a liver
  nose and long speckled ears hanging below the helmet. The tile and visor are the mcl39
  anthracite from `lib/theme.css`; the helmet no longer wears the livery's papaya. `favicon.ico`
  (16, 32, 48, RGBA PNG frames), `apple-touch-icon.png` (180, full-bleed, opaque) and
  `manifest-192/512.png` (rounded, RGBA) are rendered from it with headless Chromium (Playwright,
  browsers at `/opt/pw-browsers`) and packed with Pillow; re-render all four when it changes, and
  re-copy it to `apps/home/public/lando-icon.svg` (the hub's sidebar icon, a byte copy). The
  favicon's 16px frame alone is drawn from a variant: visor tint 0.22, no streak or reflection,
  and only the three largest blob shapes at stroke 30 with no smiley or cheek lines. At 16px the
  full pattern turns to green mush and at 0.35 the face greys out. The SVG's header comment
  describes the variant; keep that frame lighter and sparser on any redraw.
- A web app manifest at `/app.webmanifest` (a route, `app/app.webmanifest/route.ts`) for Chrome's
  install. No other app has one.

## How it works

- **Five kinds plus `void`** (`lib/events.ts`; `health` is described under State). `details` per kind, every key required unless
  marked `?`: potty `{what: pee|poop|both|none, where: outside|inside, leash?: leashed|unleashed|box|pen(retired), spot?: box|loose|crate(retired)|pen(retired), minutes?: 1-120, issue?: uuid, photos?[]}`
  (inside = an accident: warned in the form, red in the feed, counted apart in Analytics;
  `leash` and `minutes` only when outside, `spot` only when inside); food `{type, item_id, item_name, kcal_per, unit, amount}`; exercise
  `{type: walk|playtime|training, where, with_dogs, minutes, treats, commands?, dogs?, photos?}` (commands
  on training only, from the fixed list `COMMANDS`; `dogs` is 1 to 20 `lando.dogs` ids, only when
  `with_dogs` is true); weight `{value, unit, visit?: uuid}` (TEC-151: only a vet visit's Weight sets `visit`). `parseDetails` checks these on the phone (before
  the sheet closes) and again on the server; the database holds the same shapes in the SQL
  function `lando.details_ok(kind, details)`, which `events_details_shape` calls (migration
  `lando_health_events` moved the check there, from `widen_lando_potty_none`'s, and added
  `health`; the kind test is inside the function, and `events_kind_check` is gone). Entries from before
  `leash` and `dogs` (TEC-125) have neither: "pee", and "with several dogs" (see Other dogs).
- **No potty** (`what: "none"`, TEC-129; the owner's label, POTTY_WHAT_LABELS): a trip out with
  nothing done. It keeps Where and, outside, Leash, like any potty. It resets neither the pee nor
  the poop clock, is never an accident (`isAccident`; inside hides the accident warning and the
  row is not red), and counts as nothing in Analytics' per-day rows. The feed reads
  **No potty** with "outside · leashed" or "inside".
- **Potty's Leash pick** (Leashed / Unleashed / **In box**, TEC-186) shows only while Where is Outside, and
  defaults to Leashed on a new entry. It is not remembered per phone. Correcting an old outside
  entry that has none opens with nothing picked, so a correction never invents one. The feed
  shows it after the what: "pee · unleashed". **`pen` is retired** (TEC-186) the way the food catalogue retires
  an item: `LEASH` still holds it (so `parseDetails` and `lando.details_ok` accept it and the feed labels it
  "In pen"), but `LEASH_OFFERED` is what the form offers. `leashOptions(current)` adds the entry's own retired
  value to the chips, picked, so a correction on it shows it and saves it unchanged until another is tapped.
- **Potty's Spot pick** (**Box** / **Loose**, TEC-161, reworked by TEC-186) shows only while Where is Inside, the
  twin of Leash. Nothing is picked by default (a new or old inside entry never gets one unless tapped);
  switching Where to Outside drops it from the save, as Inside drops Leash. Optional `spot` in
  details, inside only (`parseDetails` and `details_ok`, migration `lando_potty_inside_spot`). `crate` and `pen`
  are retired exactly as the leash `pen` is (`SPOT` holds all four, `SPOT_OFFERED` is `box`, `loose`,
  `spotOptions`). The feed reads **Pee** with "accident, inside · box". Inside is still an accident; Analytics is unchanged.
  Live data at TEC-186: no entry holds leash `pen` or any `spot`. `box` is in `lando.details_ok` through migration
  `lando_box_leash_spot` (both lists widened, `'box'` added; the spot list is written `('box', 'crate', 'pen',
  'loose')` because `tests/details-ok-superset.test.ts` mutates the literal `'crate', 'pen', 'loose')`).
- **Potty's Time outside** (TEC-176, range chips since TEC-193) shows only while Where is Outside, below Leash:
  **range chips only, no number box**: **≤5**, **5–15**, **15–30**, **30–45**, **45–60** (`OUT_MINUTES_CHIPS`
  5, 15, 30, 45, 60; `outMinutesLabel`; the en dash is the character "–"; screen readers get "5 minutes or
  less", "5 to 15 minutes"…, `outMinutesAria`). **Each chip stores its upper bound in the existing `minutes`**,
  so no migration. Five chips are one `grid-cols-5` row. The pick is the answer. Time from going out to coming
  back in. Optional: nothing
  is picked on a new entry, it is never remembered per phone, and a correction opens holding the entry's own
  minutes. **A stored value that is not one of the five (7, 10, 20, 25, 90, from the earlier chips) shows no chip
  picked, saves unchanged** unless a chip is tapped, and **reads "N min"** in the feed; the five read as ranges
  (`outMinutesText`: "≤5 min", "5–15 min"…; `outMinutesChip` finds the chip a value matches). There is no extra chip
  for an old value. Tapping the picked chip again clears it. Switching Where to Inside drops it from the save. No
  potty keeps it. Stored as optional `minutes` in potty details, outside only (`parseDetails` for any whole 1
  to `OUT_MINUTES_MAX` (120), and `details_ok`, migration `lando_potty_minutes`); the bound was not narrowed and
  no data was touched. It shows on the feed row only; Analytics is unchanged.
- **A potty row's title is the what** (TEC-174; `describe()`): **Pee**, **Poop**, **Both** or **No potty**
  (`POTTY_WHAT_LABELS`), never "Potty" or "Accident". The detail never repeats it: "outside · leashed",
  "outside" (no leash picked), "outside · leashed · 5–15 min" (Time outside, after the leash), "inside · box", then the issue link and photo count. An accident (`isAccident`)
  keeps the red row and leads its detail with "accident, " ("accident, inside · box"). The filter pill, Log
  button and form keep the word Potty. Analytics' day timeline has its own labels (`MARK_LABELS`) and is unchanged.
- **Photos sit below the Note** (TEC-172) on Potty, Fun and Training: `LogForm` renders one
  `PhotoPicker` after the shared Note field (When and Human, then Note, then Photos), not inside each
  kind's block. Health keeps its own Note and then its Photos, as before.
- **Potty's photos and Related issue** (TEC-142): below Leash and Spot, the Medical issue checkbox and its select; the
  same Photos block as Health, Fun and Training (Take photo, Choose photos, Save waits for each,
  `missingPhotos` backs it) comes after the Note; stored as optional `photos` on the potty details. Feed: "Poop"
  "accident, inside · re: Stomach & appetite, Oct 24 · 1 photo" with the thumbnails. The note stays optional.
- **Exercise's Other dogs** is one pick (TEC-129, replacing TEC-125's multi-select): a plain
  full-width `<select>`: None, every row in `lando.dogs` by name, Multiple, "Add dog…". There is
  no Yes/No. `dogsFromPick` (`lib/events.ts`) maps the pick: a dog saves `with_dogs: true,
  dogs: [id]`; Multiple saves `with_dogs: true` and no `dogs`; None saves `with_dogs: false`.
  Add dog never becomes the value: it swaps the select for a name box with Add and Cancel (Enter
  adds; it is not a nested form, so Enter does not save the session), and the new dog is then
  picked. `dogsPickFor` opens a correction: one listed dog opens on it; `with_dogs` with no ids
  (Multiple, or an entry from before TEC-125) opens on Multiple, which saves the same shape; an
  entry naming several dogs, or one no longer listed, opens on an extra option showing those
  names (`DOGS_KEPT`) and saves them unchanged until another pick is made. The feed names
  them: "with Dog A, Dog C"; `with_dogs` and no ids reads "with several dogs" (Multiple and pre-TEC-125 entries
  alike; the owner accepted the relabel, 2026-10-22); an id no longer in the table
  reads "another dog". `MAX_DOGS` (20) and the array check stay, for old entries. The server
  refuses an id not in `lando.dogs` (`writeEvent`), since jsonb carries no foreign key.
- **Friends' dogs** (`lando.dogs`, migration `create_lando_dogs`): id, name (1 to 40 characters,
  unique ignoring case and outer spaces). Added in the app by Add dog (`POST /api/dogs`,
  `lib/journal.ts:addDog`, the same pattern as people: the name is trimmed and inner spaces
  collapsed; one already there in any case is returned, not duplicated) or by SQL. The new dog is
  merged into the loaded list in name order without a reload. Read with the journal (`listDogs`),
  ordered by name. The `create_lando_dogs` header still says "added by SQL, never in the app";
  that file is applied and is not edited.
- **A weight is a date.** Its When picks a day (`type="date"` under the same label overlay:
  "Today", "Yesterday", "Oct 19"), stored at local noon (`lib/localtime.ts:fromDateInput`,
  `DATE_ONLY_HOUR`), so it never slips a day across a time zone. An untouched new weight saves
  today at noon, also when saved before noon. The feed puts a weight under its day's heading
  with no clock time and orders it at noon (`happenedAt`); the growth chart was already by day.
  Weights from before this keep their logged time in the database. Every other form keeps date
  and time. (`rowTime` in `lib/localtime.ts` is used only by `tests/localtime.test.ts`.)
- **Food catalogue** (`lib/foods.ts`) is the code list **plus foods added in the app** (TEC-191, the
  owner's reversal of the 2026-10-20 "fixed in code, no add another"). The picklist is the code
  items then the added ones in the order added, not retired, Misc last (`picklist(type, added)`);
  `findFood(type, id, added)` resolves either, retired too. Royal Canin Dachshund Puppy (369 kcal/cup,
  Royal Canin's figure, source in its comment) is the second meal in code.
  The server builds the food snapshot (name, kcal-per, unit) from the catalogue by `item_id`;
  whatever the phone sends for those is ignored. **Calories are recorded and never shown.** Each
  figure's source is a comment on its item.
- **Added foods** (`lando.foods`, migration `lando_foods`): id (uuid), type (`meal` | `treat`), name
  (1 to 60 characters, unique per type ignoring case and outer spaces), unit (`FOOD_UNITS`: cup, scoop,
  piece, treat, pop, gram), kcal_per (nullable, above 0), created_at, retired. RLS on, zero policies.
  **The Food form's What pick ends with "Add a food…"** after Misc (`FOOD_ADD`, never a value, like
  Add dog): it opens an inline Name, Unit (meals open on cup, treats on piece) and optional Calories
  per unit (recorded, never shown). Add posts to `POST /api/foods` (`lib/journal.ts:addFood`,
  `parseNewFood`: a name already in that list, code or added, in any case, is a 400, never a
  duplicate), merges the row into the loaded list without a reload and **selects it; nothing is
  logged until the form's Save.** Read with the journal (`listFoods`, `/api/journal` returns `foods`),
  and by `writeEvent` for a `food` body, so the snapshot of an added food is built server-side like a
  code one. Added foods are passed as the `added` argument (`parseDetails`, `parseNewEvent`,
  `foodSnapshot`, `treatEntry`, `quickLog`, `defaultFood`); Quick log's Meal prefill opens on an added
  meal as the last meal. The inline treat row lists added treats but has no "Add a food…".
  There is no way in the app to retire or rename an added food yet; `retired` is set by SQL.
- **Defaults per phone** (`lib/defaults.ts`, `localStorage`): `lando.person` (asked once on a
  phone's first open, "Whose phone is this?"), `lando.defaults` (last meal item, last weight unit,
  last meal amount). A meal opens on the last meal item and amount saved from this phone, or Misc
  on its first. A treat always opens on Misc and an amount of 1 (TEC-129); the last treat is no
  longer written, and a `treat` key left on an older phone is ignored. Only new entries are
  remembered, never corrections; exercise to a 15-minute walk outside, no dogs picked, no treats; potty to pee outside,
  leashed; "when" to the moment Save is pressed unless it was changed (a weight: today at noon).
- **One read** (`GET /api/journal?since=`, `lib/journal.ts:readJournal`): `since` is the phone's
  local midnight. It returns the 30 days before it (`HORIZON_DAYS`), every weight ever, every
  voiding event, all people and all friends' dogs. Paged; past 20 000 rows it fails rather than reading short.
  Analytics uses the same read.
- **Live events** (`lib/events.ts:liveEvents`): an event is live when no event's `voids` names it,
  and a `void` is never live. Pills, feed, charts and Analytics read live events only.
- **Writes** (`POST /api/events`) are inserts only: a new entry, a correction (same kind, `voids`
  the old one, keeps its time unless a new one is sent; the form sends the entry's own `at`,
  to the millisecond, while When is untouched, since TEC-136) or a delete (`kind = 'void'`, at the
  database's now). The phone chooses each id, so saving the same entry twice returns the first row.
- **The database backs it** (migration `lando_people_and_events`): UPDATE and DELETE on
  `lando.events` raise; `voids` is unique, so a second change to one entry is a 409 and the screen
  reloads; a `void` must name its target and carry `{}`.
- **Pills**: an inside potty still resets its pee or poop clock; both resets both. A time in the
  future is ignored. Nothing in 30 days reads "none". Values never exceed six characters
  (`formatAgo`: "47m", "2h 5m", "14h", "3d 4h", "12d").
- **Save never waits.** The sheet closes at once; the entry shows as "Saving…" and then joins the
  feed, or stays as "Not saved" with Retry. Unsaved entries are mirrored to `localStorage`
  (`lando.unsaved`) and retried on the next open. Corrections and deletes are awaited in the sheet
  and show their error there.
- **People** are typed in the app (`POST /api/people`); a name already there in another case is
  returned, not duplicated.
- **Per-day aggregation** (`lib/analytics.ts:perDay`): days are built with the calendar
  (`new Date(y, m, d - i)`), never by subtracting 24 h, so a DST change cannot shift an evening.
  Averages count complete days only, from the first day anything was logged. Every Analytics
  function takes the day's midnight as `now`, except `mealToPoop`, which needs the real clock to
  tell "pending" from "missed" (the screen passes it by the minute).
- **Growth chart** (`app/GrowthChart.tsx`): live weights in the newest weight's unit, y axis from
  zero, tap for the nearest point, a table underneath; `since` limits it to a window. Shown in
  Analytics only.
- **Person boxes fit a name** (TEC-129): Human in every form and "Logging as" take an inline
  width from `nameBoxWidth` (`lib/names.ts`): the longest `display_name` in `ch`, at least 6
  (the "Nobody" option) and at most 14, plus one `ch` and room for the padding and arrow. Past
  14 characters the closed box truncates; the open list shows the name whole. The empty options
  read "Nobody" (Human) and "Who?" (Logging as) so they fit.
- **Chart colours** are `--lando-series-1..3` in `app/globals.css`, read from the theme's tone and
  ink tokens; series 2 is burnt orange in light and peach in dark, where the accent is papaya.

## Traps

- **Upcoming's Done on a visit is client-linked.** The link from the visit to its item lives in `Journal`'s
  `visitLinks` ref, not in storage. If the visit saves but the phone loses the page before the `done` call
  lands (or the call fails twice), the visit is in the journal and the item stays open; a toast says so. Tapping
  Done again would log a second visit, so check the feed first and Cancel the item instead. A visit left unsaved
  across a reload is retried from storage without its link. Upcoming dates are `YYYY-MM-DD` strings and
  `due_time` is `HH:MM` (Postgres returns `HH:MM:SS`; `upcoming-db.ts` trims it): never build one with
  `new Date("YYYY-MM-DD")`, which reads as UTC.

- **Every Lando change a user would notice adds its line to `RELEASES`** (`lib/releases.ts`), at the
  top, on the same branch, and a **new day also needs its one-line summary in `DAY_SUMMARIES`**. Plain words,
  what they can now do, no issue numbers, file names or jargon, no real names. Nothing checks that a change
  added one; `tests/releases.test.ts` checks the shape (valid dates, newest first, a summary for every day with
  entries, whole days shown, no ticket numbers). Never rewrite an existing sentence or summary.

- **"JWT issued at future" is Supabase's, intermittent, and retried.** "Couldn't load the journal.
  (couldn't read the journal: JWT issued at future)" is a 401 from Supabase's own clock drift:
  its gateway mints a token per request and a backend a little behind rejects it. It hits one of
  the three concurrent reads, mostly on the first open after idle, and the next request succeeds.
  `retryingFetch` in `lib/supabase.ts` sends such a request once more after 300ms and returns
  the second answer as it is; any other 401 or status passes through, so a real key failure still
  shows. Do not widen it to other 401s, and do not swap it out of `getServiceClient`.
- **A training's treats are found by its exact `at`** (`treatsWith`). Anything that rounds a
  correction's time (the `datetime-local` input holds minutes only) unlinks them: an untouched
  When must keep sending `event.at` as it is. Compare with `Date.parse`, never as strings: the
  database spells the instant `+00:00`, the phone `Z`.
- **A sheet inside a sheet must be portalled.** The bottom sheet rises with a `transform`, which
  makes it the containing block of any `position: fixed` child; `Sheet nested` draws into
  `<body>` for that reason. Nothing uses it since TEC-193 removed Training's pop-up, but it stays for the
  next one. React events still bubble through the portal to the outer `<form>`,
  so such a pop-up holds no `<form>` and only `type="button"` buttons, or Enter would save the
  entry.
- **The top of the installed app** (TEC-188). Installed, `viewportFit: "cover"` lets the page run under the status
  bar. `body` used to pad the top by `env(safe-area-inset-top)`, which only moves the first screen down; scrolled,
  content slid up through that band above the sticky tabs (`top: env(safe-area-inset-top)`) and showed behind the
  status bar. Now `body::before` is a fixed paper-coloured strip exactly the inset tall (`app/globals.css`), and the
  body pads the inset plus `min(inset, 8px)`, so the bar has up to 8px of clear space and Safari (inset 0) is
  unchanged. Checked here only by rewriting the inset to 47px in a Playwright run; never on a real standalone
  iPhone. Keep the strip's z-index at the tabs' (10) or below the sheet backdrop (20).
- **The amount scroller's rows are 32px each** (`SCROLLER_ROW` in `lib/scroller.ts`): the band,
  the half-row padding and the box height (two rows) all come from it through `scrollerWindow()`. Change the
  one number; the snap math in `AmountScroller.tsx` assumes the padding is half a row.

- The Supabase exposed-schemas list is outside the repo. Without `lando` on it, every read fails as
  a permissions error that reads like a bad key; `/api/health` probes `lando.events`.
- **The food catalogue is history's key.** Never delete an item or change its `id`: mark it
  `retired: true`, or its old entries can no longer be corrected (the server refuses an unknown
  `item_id`). Changing a name or calorie figure is safe; old entries keep their snapshot. A new id
  must match `^[a-z0-9-]{1,60}$` or the database refuses it.
- **`lando.foods` is history's key too.** An entry holds an added food's `item_id` in jsonb, so no
  foreign key protects it: never delete a row or change its id (a uuid, which that pattern accepts).
  Retire with `retired = true`. **A food entry's save reads `lando.foods`**: without the table (code
  merged before `lando_foods`) every food save, and every journal load, is a 503. The unit list is in
  two places, `FOOD_UNITS` and the table's check; a test holds them equal.
- **A new detail field needs three edits:** `parseDetails` in `lib/events.ts`, `lando.details_ok`
  (a new migration; see the next trap), and the tests. The function allows no unknown key, so a
  field added in the app alone fails every save with a 503. A new kind is a branch in the same
  function: an unknown kind has none, so it is refused.
- **Widen `lando.details_ok` with `create or replace function`, and only ever widen.** The
  constraint `events_details_shape` just calls it, so a widening is a new migration holding the
  function's whole current body with the one list or shape grown: copy the whole body from the
  newest migration file that defines `lando.details_ok`, sorting `supabase/migrations` by version
  (today `lando_box_leash_spot`, which is `lando_potty_minutes`'s body plus `'box'` in the leash and spot lists;
  that one is `lando_details_ok_search_path`'s plus potty's optional
  `minutes`; that one is `lando_potty_inside_spot`'s plus `set search_path = ''`; keep that line in every copy). No DROP, no constraint swap, and it goes through the connector. Replacing
  the function does **not** re-check existing rows, so a function that narrows would leave rows the
  database now calls invalid, and nothing would say so. Narrowing (removing a value, requiring a
  new key) needs a validated swap: a NOT VALID constraint calling a new function, the failing rows
  fixed or voided, VALIDATE, then drop the old one. Start a migration with
  `set local lock_timeout = '5s';` so a busy table fails fast. The older swaps
  (`widen_lando_events_details_shape`, `widen_lando_potty_none`) were DROP and ADD in one ALTER run
  by the owner in the SQL Editor; that path is retired.
- **`tests/details-ok-superset.test.ts` guards widenings** (TEC-164): the newest migration defining
  `lando.details_ok` must keep every `ARRAY[...]` key, `IN (...)` value and `<@ '[...]'` list value of
  the one before it, and the same holds at each step from `lando_health_picklist` on. A body copied
  from an older file fails it. It compares lists, not rules: a changed bound (`BETWEEN 1 AND 6`) or a
  regex is not seen, so a narrowing of those still needs the validated swap above. Each widening's
  own test still holds its own file's shape.
- **The health lists are in two places:** `VET_REASONS` + `VET_RETIRED` and `ISSUE_PICKS` +
  `ISSUE_RETIRED` in `lib/events.ts` and `lando.details_ok`. The database holds the union.
  `tests/health.test.ts` reads the newest migration defining the function (by version; it must be
  no older than `lando_health_picklist`) and fails if its two reason arrays differ from the code's
  unions or drop an id `lando_health_events` held, if it lacks the health branch, the
  `MAX_PHOTOS` bound, the `PHOTO_PATH` pattern or exercise's `photos` key, or if that file holds
  anything but `set local lock_timeout` and the function. The next widening is simply a newer
  file; the test follows it.
  A new offered pick is a new id in the code and the function (never a reused retired one with
  a new meaning, since old entries hold it).
- **`issue` and potty `photos` are in two places:** `parseDetails` and `lando.details_ok`
  (migration `lando_issue_links`). `tests/links.test.ts` reads that file: the potty branch must allow
  `issue` and `photos`, the health branch an `issue` for `type = 'vet'` only, every other branch must
  equal `lando_health_picklist`'s, and the file is only `lock_timeout` and the function. It does
  not assert it is the newest file: each later widening's test holds its own file's shape.
- **A weight's `visit` is in two places:** `parseDetails` and `lando.details_ok` (migration
  `lando_vet_weight`, whose test reads it: weight allows an optional `visit` uuid, every other branch
  equals `lando_issue_links`'s). The database does not check the target is a vet visit; `writeEvent` does.
  A weight's `visit` is never rewritten, so after a visit is corrected it still names the old id:
  always read it through `linkedWeight` / `resolveVisit`, never by `id ===`. A visit older than the
  read's 30 days is never opened, so a linked weight is always in the read (every weight is).
- **A link to an issue outside the read reads "re: earlier issue".** The read is the last 30 days
  plus every void, so a vet visit that links to an issue older than that cannot name it. A correction
  of that old issue is read (it carries the old time and `voids`), but not the issue itself. Whether
  to show the name is open in Linear, TEC-148.
- **Photos are never replaced or deleted** (RULES.md, Never 6): the event holds paths only, and an
  entry never changes, so no code path removes an object. Anything that would (a cleanup of
  unreferenced photos) must first check every event, voided ones included, since a voided entry
  still names its photos. `uploadPhoto` (`lib/storage.ts`) uploads with `upsert: false`, so the bucket
  refuses a taken path; it then reads the stored bytes back. The same bytes are a retry and succeed;
  different bytes are a `PhotoConflict`, answered 409 by `POST /api/photos`, and the stored photo
  stays. Retry re-sends the blob `Photos.tsx` kept, so it is byte-identical; a re-encode under the
  same id would be a conflict.
- **The photo upload is one request under Vercel's body limit** (about 4.5MB; the route and the
  bucket cap at 4MB). The canvas downscale is what keeps a phone shot under it. If a browser
  cannot decode the file (a HEIC on a browser that cannot read it), the photo fails with the
  reason and Retry will fail again until it is removed.
- **The potty `what` list is in two places:** `POTTY_WHAT` in `lib/events.ts` and `lando.details_ok`. A value in the app alone fails every save of it with a 503.
- **The dogs check is a jsonpath filter in `strict` mode.** A CHECK cannot hold a subquery, so each
  id is tested with `jsonb_path_exists`; lax mode unwraps nested arrays and would let `[[id]]`
  through.
- **`lando.dogs` is history's key, like the food catalogue.** Never delete a dog or change its id
  while an entry names it: the entry would read "another dog", and a correction that keeps it is
  refused. Renaming is safe. `lando.dogs` has no append-only trigger.
- **The journal read fails whole without `lando.dogs`.** `/api/journal` reads it with the events;
  if the table is missing (code merged before `create_lando_dogs`), every load is a 503. An empty
  table is fine.
- **Never parse a weight's date with `new Date("YYYY-MM-DD")`**: that is UTC midnight, the day
  before west of Greenwich. `fromDateInput` builds local noon from the parts.
- The training command list is in two places: `COMMANDS` in `lib/events.ts` and `lando.details_ok`. Add a command to both.
- Tailwind's `flex` beats the `hidden` attribute, so the tab panels also switch their class.
- **The When field is a label over a transparent `datetime-local`** (`app/LogForm.tsx`). The native
  control is wider than half a phone and pushed into Human, so the form shows `whenLabel`
  (`lib/localtime.ts`: "Now" for an untouched new entry, else "Today 9:05 PM", "Yesterday …",
  "Oct 19 …") and keeps the real input, `opacity-0`, over it; a tap calls `showPicker()`. Do not
  give the input a visible style or a width of its own, or the overlap comes back. When and Human
  share a row in every form: `grid-cols-[minmax(0,1fr)_auto]`, Human sized by `nameBoxWidth`,
  When taking the rest. Keep `minmax(0, …)` on When's column, or the native control's own width
  can push Human off the row again.
- **Spacing has no theme tokens.** `lib/theme.css` holds colour only; spacing is Tailwind's default
  scale. The compact pass (TEC-123) uses a 12px page gutter (`px-3`) on the page, tabs, app bar and
  sheet, and keeps every control at least 44px tall; seg chips are unchanged.
- `TRUNCATE` is not covered by the append-only trigger.
- Next 16 drops `apple-mobile-web-app-capable` unless `metadata.other` in `app/layout.tsx` writes it.
- Turbopack refuses an ICO whose PNG frame is not RGBA; `app/favicon.ico` is RGBA.
- The three lando migrations were edited in place on 2026-10-20 because none was applied anywhere.
  Once applied, never again: any change is a new migration.
- `mcl39` must exist in the theme (`packages/shared/lib/theme.ts`, stamped into `lib/theme.ts`) or
  `lib/livery.ts` fails the typecheck.
- The manifest sits behind the gate, so `layout.tsx` links it with
  `crossOrigin="use-credentials"`. Next's `app/manifest.ts` writes the link without it outside
  Vercel previews, and the browser would get the login redirect instead. Its icons are static
  imports (`/_next/static`), which the gate admits. Signed out, the manifest is a 307: harmless.
- The owner's photos of Lando were the reference for the icon and never enter the repo (RULES.md,
  Never 2): the icon is drawn, not traced, and no photo or crop of one is committed. A redraw is hand-placed
  vector shapes; never an `<image>` in the SVG. The same holds for the owner's photo of the
  blob helmet (TEC-124): reference only; the pattern is freehand, and its sponsor marks are not
  copied. The repo has no render script; the favicon's 16px variant is made by editing a copy of
  the SVG as its header comment says.
- `tsc` cannot resolve the PNG imports until `next build` (or `next dev`) has written
  `next-env.d.ts`, which is not tracked. Build first on a fresh checkout.
- `app/icon*.png` is a Next metadata convention; the manifest PNGs are named `manifest-*.png` so
  Next does not treat them as icons.
