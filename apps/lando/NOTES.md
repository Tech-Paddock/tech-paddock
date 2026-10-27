# Lando — notes

## State

- v2 on Next.js 16: two tabs under the app bar, **Log** and **Analytics**, sticky, opening on Log
  (the owner's override of the one-screen rule, in RULES.md).
- **Log**: four since-last pills in one row (pee, poop, food, exercise; label over value, the
  clock time in the title and for screen readers; coloured by TEC-142, below), "Logging as", six
  section buttons in two rows of three (TEC-137: Potty, Food, Fun / Training, Weight, Health;
  15px labels, 52px tall; the Weight button shows the newest weight on its face, "7.3 lb", with
  its date still in the title and screen-reader text), then the **Feed** under a row of filter pills
  (TEC-171, below). No growth chart
  on Log since TEC-129: it lives in Analytics only. Each button opens a bottom sheet
  (`app/Sheet.tsx`) with that form (`app/LogForm.tsx`, prop `form`), defaults filled in, so Save
  is usually the only other tap. Tapping a feed row opens the matching form on that entry to
  correct or delete it.
- **Health** (TEC-137, reworked by TEC-139): a sixth form, kind `health`, with a Type of **Vet
  visit** or **Medical issue**, then **one plain full-width `<select>`** of high-level picks
  (styled like Other dogs'), a required **Note** under it ("What happened?"), up to `MAX_PHOTOS`
  (6) photos, and the usual When and Human. Vet visit: Check-up, Vaccines, Sick or injured,
  Procedure (spay/neuter, dental), Follow-up, Other (`VET_REASONS`). Medical issue: Stomach &
  appetite, Skin, ears & eyes, Limping or injury, Breathing or cough, Energy or behaviour, Other
  (`ISSUE_PICKS`, both in `lib/events.ts`). A new entry opens on "Pick one…" and Save without a
  pick says so. Switching the Type keeps the pick only if the other list shares it ("Other").
  Stored shape unchanged: `{type: vet|issue, reasons[], photos?[]}`, `reasons` an array of one for
  every new entry; the story is the event's own `note`. Feed: "Vet visit  Check-up · 2 photos"
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
  phone chooses each photo's id, so a retry is the same object (upload is an upsert). `GET
  /api/journal` returns `photos`, a path -> signed URL map for the live health, exercise and potty entries (an hour; `eventPhotos`);
  the screen adds each upload's URL as it happens, and a path that could not be signed reads "No
  photo" / "Photo unavailable", never a blank. A correction keeps the photos it does not remove
  and the voided entry keeps all of its own; a delete is a void. **Nothing is ever deleted from
  the bucket**, so a photo removed in a correction, discarded with an unsaved entry, or uploaded
  and abandoned stays there, unreferenced.
- **Pill status colours** (TEC-142). Each pill but Exercise wears a status from how long ago its
  last event was (`pillStatus`, with the thresholds as named constants, all in `lib/events.ts`):
  **pee and poop** green under 1 h, yellow from 1 h up to and including 3 h, red over 3 h
  (`POTTY_YELLOW_MS`, `POTTY_RED_MS`); **food** green under 3 h, yellow from 3 h, red at 5 h or more
  (`MEAL_YELLOW_MS`, `MEAL_RED_MS`). Exercise stays plain, and so does "none". The status is also in
  words, in the pill's `title` and in its screen-reader text (`PILL_STATUS_WORDS`: "green, recent",
  "yellow, getting long", "red, overdue"). The colour is a local pattern in `app/globals.css`, next
  to `--lando-series-*`: `--lando-status-green` and `--lando-status-yellow` (own values, one pair
  for light and one for dark) and `--lando-status-red` (the theme's `--danger`); `.lando-pill
  [data-status]` draws a 2px edge (border plus an inset ring, so no size change) and a 16% tint,
  with the ink text unchanged. Contrast, checked against the mcl39 tokens: each edge at least 4.4:1
  on both the surface and the paper in light and dark; ink on a tint at least 11:1.
  **The food clock is the last meal** (`sinceLast`): a treat no longer resets it (before TEC-142 a
  treat did). The pill is still labelled Food.
- **Meal gaps under the pills** (TEC-172): under Pee, Poop and Food (not Exercise), a small plain
  second line, stacked beneath the pill (outside its coloured box, so the status colour never
  applies to it; 10px, soft ink, truncating). `mealGaps` / `mealGapText` / `formatGap` in
  `lib/events.ts`, tested in `tests/mealgaps.test.ts`. **Pee: "meal→ 40m"** is the latest meal to the first
  pee at or after it (pee or both, inside counts, the pills' own rule; No potty does not); **Poop** the same for poop; **Food: "gap
  4h 10m"** is the latest meal minus the one before it. Meals only, never treats. If nothing
  followed the latest meal the line reads **"not yet"**; it never borrows an older meal's pee.
  One meal ever: the Food line is blank; no meal in the read: all three are blank. Under a minute
  is "<1m". Live events only, the future ignored, and it reads the same 30-day window as the pills.
  Each line has screen-reader text and a title ("First pee came 40m after the latest meal", "4h 10m
  between the last two meals", "No pee since the latest meal yet"). Longest line ("meal→ 9h 59m")
  fits a quarter of 375px; changing the wording means re-checking that.
- **Meals today** (TEC-142): "Meals today: N" at the right of the app bar, beside the livery badge
  (`mealsToday`: live `meal` entries whose `at` falls in the phone's local day; treats, voided and
  deleted entries do not count). The bar is the page's server component, so `app/Meals.tsx` is a
  small context: `Journal` reports the count (`useReportMeals`), `MealsBadge` shows it, and
  nothing shows until the journal has loaded. The bar wraps rather than clips on a very narrow phone.
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
- **Fun and Training** (TEC-136) replace the Exercise button. Both save kind `exercise` with the
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
  28px). `aria-pressed` on every button, All pressed when nothing is picked. Tap a form's pill to show only
  that form's entries (unsaved rows too), tap it again, or All, for everything. Food covers meals and treats. Held in memory, not remembered. Empty reads
  "Nothing logged yet." or, under a chip, "No training entries yet." (`emptyFeedText`).
- **Food amount is a scroll picker in ⅛ steps** (TEC-136, `app/AmountScroller.tsx`, a local
  pattern): three rows show, the middle one is the pick, it snaps a step at a time; one
  `spinbutton` for screen readers (arrows step, Page keys a whole unit, Home and End). It offers
  "—" (no amount, as before) and 1/8 up to `AMOUNT_PICKER_MAX` (20) (`amountOptions`). The stored
  bound is unchanged (above 0, at most 1000). An amount the form opened on that is not an eighth
  (an older 1/3) or is past 20, and a phone's remembered meal amount, are slotted into the list,
  so an untouched correction keeps them. Eighths read as fractions, reduced (`formatAmount`:
  "1/8", "3/8", "1 1/4"). Defaults unchanged: a treat opens on 1, a meal on this phone's last
  meal amount, or "—" on its first.
- **Treats on Training** (TEC-136): "+ Treat" beside Treats used opens a pop-up (a nested
  `Sheet`, drawn into `<body>`; its Escape closes it alone) to pick the treat (opens on Misc) and
  its amount (the scroller, opens on 1). Add treat queues it in the form ("To log on save: …", ✕
  removes it) and adds one to Treats used (✕ takes one off); the number stays editable. On Save,
  each queued treat becomes a food `treat` entry at the session's exact `at` and Human
  (`treatEntry`), saved **after** the session:
  - New session: the session is a pending row carrying its treats (`then`, mirrored in
    `lando.unsaved` with it). Once it saves, each treat is saved as its own row with its own
    Retry. If the session fails, its row reads "+ 2 treats" with Not saved: Retry saves the
    session and then its treats; ✕ discards both, so no treat is ever logged for a session that
    never was.
  - Closing the sheet without saving drops the queue with the rest of the form: nothing is logged.
  - Correction: the queued treats are saved once the correction succeeds; if it fails, the form
    stays open with its error and the queue intact.
  - Deleting a training leaves its treats: they were eaten. Delete one from the feed if it was not.
  - A correction shows the treats already logged with the session ("Logged: …", `treatsWith`):
    live food treats at the session's exact `at`, to the millisecond. There is no link column.
    Moving the session's When in a correction leaves its treats at the old time (correct them
    from the feed), and they then no longer show on it.
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
- The gate file is `proxy.ts`, the base copy. Not yet in the hub's `TOOLS`
  (`apps/home/lib/platform.ts`); that is a separate home change, and until it lands The Garage
  does not probe `/api/health`.
- Livery `mcl39` (McLaren '25: papaya on anthracite), worn by Lando alone. The theme files carry
  it because this branch merged `claude/home-papaya-livery`.
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
  browsers at `/opt/pw-browsers`) and packed with Pillow; re-render all four when it changes. The
  favicon's 16px frame alone is drawn from a variant: visor tint 0.22, no streak or reflection,
  and only the three largest blob shapes at stroke 30 with no smiley or cheek lines. At 16px the
  full pattern turns to green mush and at 0.35 the face greys out. The SVG's header comment
  describes the variant; keep that frame lighter and sparser on any redraw.
- A web app manifest at `/app.webmanifest` (a route, `app/app.webmanifest/route.ts`) for Chrome's
  install. No other app has one.

## How it works

- **Five kinds plus `void`** (`lib/events.ts`; `health` is described under State). `details` per kind, every key required unless
  marked `?`: potty `{what: pee|poop|both|none, where: outside|inside, leash?: leashed|unleashed|pen, spot?: crate|pen|loose, issue?: uuid, photos?[]}`
  (inside = an accident: warned in the form, red in the feed, counted apart in Analytics;
  `leash` only when outside, `spot` only when inside); food `{type, item_id, item_name, kcal_per, unit, amount}`; exercise
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
- **Potty's Leash pick** (Leashed / Unleashed / In pen) shows only while Where is Outside, and
  defaults to Leashed on a new entry. It is not remembered per phone. Correcting an old outside
  entry that has none opens with nothing picked, so a correction never invents one. The feed
  shows it after the what: "pee · unleashed".
- **Potty's Spot pick** (Crate / Pen / Loose, TEC-161) shows only while Where is Inside, the twin of
  Leash. Nothing is picked by default (a new or old inside entry never gets one unless tapped);
  switching Where to Outside drops it from the save, as Inside drops Leash. Optional `spot` in
  details, inside only (`parseDetails` and `details_ok`, migration `lando_potty_inside_spot`). The
  feed reads **Pee** with "accident, inside · crate". Inside is still an accident; Analytics is unchanged.
- **A potty row's title is the what** (TEC-174; `describe()`): **Pee**, **Poop**, **Both** or **No potty**
  (`POTTY_WHAT_LABELS`), never "Potty" or "Accident". The detail never repeats it: "outside · leashed",
  "outside" (no leash picked), "inside · crate", then the issue link and photo count. An accident (`isAccident`)
  keeps the red row and leads its detail with "accident, " ("accident, inside · crate"). The filter pill, Log
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
  and time. (`rowTime` in `lib/localtime.ts` is no longer used by the screen.)
- **Food catalogue** (`lib/foods.ts`), fixed in code; Misc last in each list, no "add another".
  The server builds the food snapshot (name, kcal-per, unit) from the catalogue by `item_id`;
  whatever the phone sends for those is ignored. **Calories are recorded and never shown.** Each
  figure's source is a comment on its item.
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
  `<body>` for that reason. React events still bubble through the portal to the outer `<form>`,
  so the pop-up holds no `<form>` and only `type="button"` buttons, or Enter would save the
  session.
- **The amount scroller's rows are 40px each** (`ROW` in `app/AmountScroller.tsx`): the band,
  the padding rows and the box height (120) assume it. Change all of them together.

- The Supabase exposed-schemas list is outside the repo. Without `lando` on it, every read fails as
  a permissions error that reads like a bad key; `/api/health` probes `lando.events`.
- **The food catalogue is history's key.** Never delete an item or change its `id`: mark it
  `retired: true`, or its old entries can no longer be corrected (the server refuses an unknown
  `item_id`). Changing a name or calorie figure is safe; old entries keep their snapshot. A new id
  must match `^[a-z0-9-]{1,60}$` or the database refuses it.
- **A new detail field needs three edits:** `parseDetails` in `lib/events.ts`, `lando.details_ok`
  (a new migration; see the next trap), and the tests. The function allows no unknown key, so a
  field added in the app alone fails every save with a 503. A new kind is a branch in the same
  function: an unknown kind has none, so it is refused.
- **Widen `lando.details_ok` with `create or replace function`, and only ever widen.** The
  constraint `events_details_shape` just calls it, so a widening is a new migration holding the
  function's whole current body (`lando_vet_weight`'s, the latest) with the one
  list or shape grown: no DROP, no constraint swap, and it goes through the connector. Replacing
  the function does **not** re-check existing rows, so a function that narrows would leave rows the
  database now calls invalid, and nothing would say so. Narrowing (removing a value, requiring a
  new key) needs a validated swap: a NOT VALID constraint calling a new function, the failing rows
  fixed or voided, VALIDATE, then drop the old one. Start a migration with
  `set local lock_timeout = '5s';` so a busy table fails fast. The older swaps
  (`widen_lando_events_details_shape`, `widen_lando_potty_none`) were DROP and ADD in one ALTER run
  by the owner in the SQL Editor; that path is retired.
- **The health lists are in two places:** `VET_REASONS` + `VET_RETIRED` and `ISSUE_PICKS` +
  `ISSUE_RETIRED` in `lib/events.ts` and `lando.details_ok`. The database holds the union.
  `tests/health.test.ts` finds the latest migration defining the function (by version, now
  `lando_vet_weight`; it only requires it to be at least `lando_health_picklist`'s), reads
  the two reason arrays out of its body and fails if they differ from the code's unions, if it
  drops an id the first migration held, or if that file holds anything but `set local
  lock_timeout` and the function. The next widening is simply a newer file; the test follows it.
  A new offered pick is a new id in the code and the function (never a reused retired one with
  a new meaning, since old entries hold it).
- **`issue` and potty `photos` are in two places:** `parseDetails` and `lando.details_ok`
  (migration `lando_issue_links`). `tests/links.test.ts` reads that file: the potty branch must allow
  `issue` and `photos`, the health branch an `issue` for `type = 'vet'` only, every other branch must
  equal `lando_health_picklist`'s, and the file is only `lock_timeout` and the function. It no longer
  asserts it is the *newest* file (TEC-151 added a newer widening); the newest file's own shape is
  `tests/vetweight.test.ts`'s.
- **A weight's `visit` is in two places:** `parseDetails` and `lando.details_ok` (migration
  `lando_vet_weight`, whose test reads it: weight allows an optional `visit` uuid, every other branch
  equals `lando_issue_links`'s). The database does not check the target is a vet visit; `writeEvent` does.
  A weight's `visit` is never rewritten, so after a visit is corrected it still names the old id:
  always read it through `linkedWeight` / `resolveVisit`, never by `id ===`. A visit older than the
  read's 30 days is never opened, so a linked weight is always in the read (every weight is).
- **A link to an issue outside the read reads "re: earlier issue".** The read is the last 30 days
  plus every void, so a vet visit that links to an issue older than that cannot name it. A correction
  of that old issue is read (it carries the old time and `voids`), but not the issue itself. Widening
  the read to Health issues is the fix if the owner wants the name.
- **Photos are not rewritten or deleted:** the event holds paths only, and an entry never changes,
  so no code path removes an object. Anything that would (a cleanup of unreferenced photos) must
  first check every event, voided ones included, since a voided entry still names its photos.
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
- **Merge order: `claude/home-papaya-livery` before `claude/lando-scaffold-v1`.** This branch
  carries that one's theme files byte-identical, so once it is on `main` this branch's diff is
  Lando's own. Merged the other way round, Lando would bring the livery with it and the livery
  branch would be a no-op to close. `mcl39` must exist in `lib/theme.ts` or `lib/livery.ts` fails
  the typecheck.
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
