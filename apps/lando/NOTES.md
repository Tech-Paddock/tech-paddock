# Lando — notes

## State

- v2 on Next.js 16: four tabs under the app bar, **Log**, **Notes**, **Analytics** and **Patch notes** (TEC-199, Notes TEC-204; "What's new"
  renamed in the UI only, the file is still `app/WhatsNew.tsx` and the data `lib/releases.ts`; the Upcoming tab is gone),
  sticky, four equal columns in 15px bold with `whitespace-nowrap` (at 390px "Patch notes" wrapped to two lines at 16px),
  opening on Log (RULES.md holds the owner's override of the one-screen rule).
- **Notes** (TEC-204, the owner: "a notes after log section to capture misc notes and docs"): a journal entry of a new kind,
  `note`, in `lando.events`; `details` is `{text, photos?, names?}`, `text` 1 to `NOTE_MAX` (2000) characters with its line
  breaks kept (only its ends are trimmed) and the attachments exactly as every other kind has them (TEC-203; `PhotoPicker`,
  `usePhotos`, `parseAttachments` reused, none copied). The event's own `note` column (500 at most) stays null for a note.
  * **The tab** (`app/Notes.tsx`): an **Add note** button, then every live note of any age, newest first (`liveNotes`: by `at`, then
  `created_at`). Each shows its date (`whenLabel`) and who wrote it, its text clamped to two lines (`line-clamp-2`; a tap on the
  text expands it, "Tap to read all" / "Show less", offered only when `mayOverflow` guesses it needs more than two lines), its
  attachments and an **Edit** button. **The text button and the Edit button are siblings, and so are the attachments:** a file
  is an `<a>` on its signed URL (a thumbnail for a picture, a chip with type and name for any other file), and a link can't sit
  inside a button, so a note is a `div` of separate controls, not one tappable row as in the feed. There is no search. A note
  still saving, or not saved, sits above the list with Saving…, or Not saved with Retry and ✕ (`PendingNote`).
  * **The form** (`app/NoteForm.tsx`, in the usual `Sheet`; it imports `Box`, `Field`, `input` and `inputFull` from `LogForm`, which
  now exports them): Box 1 When and Logging as; Box 2 the required long text (`maxLength` 2000, a count of what is left) and the
  attachments; Save. **No Repeat and no future When**: the When input has `max` of now, the form refuses a future time
  (`noteWhenError`), and the server refuses a note more than 5 minutes past its clock (`NOTE_SKEW_MS`, for a phone's clock running
  ahead; every other kind keeps its day). A new note saves like any entry (`save` through `logNote`: the sheet closes, a pending
  row, Retry, the unsaved store).
  * **Corrected like entries**: Edit opens the form on the note's words, and Save posts a new `note` with `voids`, Delete a `void`;
  `change` is the same function the other forms use (it says "Note corrected" or "Note deleted" when the Note sheet is open).
  `checkVoid` keeps the kind, so a note is never corrected into another kind or the reverse.
  * **Out of everything else:** `LOG_KINDS` holds `note` (so it parses, and the unsaved store accepts it) but `FORM_KINDS` does not: a
  note has no Log form, no filter pill and no colour (`formOf` is null). `Journal` splits the read once: `entries = withoutNotes(events)`
  is what the pills (`sinceLast`), the feed (`liveEvents`), the meal and weight reads, Analytics, treats and the forms get;
  `notes = liveNotes(events)` is the Notes tab's alone. A pending note is not a pending feed row (`feedPending`, `notePending`).
  **Trap:** a new reader of `loaded.events` on the Log side must read `entries`, or a note leaks in; `tests/notes.test.ts` holds
  the reads Journal makes.
  * **The read** (`readJournal`): the filter is `at >= horizon or kind = weight or kind = note or voids is not null`, so a note
  older than 30 days still lists, as every weight does; a note's attachments are signed with the live entries' (`/api/journal`).
  * **The database**: migration `lando_notes` (a `note` branch in `lando.details_ok`, nothing else). `events_kind_check` was dropped
  in `lando_health_events`, so the function is the only gate on a kind: a kind with no branch is refused. Without the migration a
  note save fails with a 503 and nothing else changes. `tests/details-ok-superset.test.ts` reads `note` as a kind now.
- **Upcoming items** (TEC-192, no tab since TEC-199): plans in `lando.upcoming` (kind vet, vaccine, medication or other; title,
  due day, optional time and note, optional repeat of N weeks, months or years, status open, done or cancelled). **A future
  When on any form creates one** (`lib/future.ts`; below). **An open item is edited in place** (TEC-203): tapping its words
  in Next 7 days or the Upcoming filter opens the form its title names (`formForItem`, `editUpcoming` in `Journal`) with the
  item's own day, time, repeat, note, medication and dose and attachments (`donePrefill` feeds the fields, `plan` on
  `LogForm` says it is an edit), and Save posts `{action: "edit", id, item}`: the same row, nothing inserted, the journal
  untouched. The When may be past (an overdue item is a plan, not an error). An item with no form of its own (an old Other
  with its own words, made by the retired Add sheet) has no edit, only Done and Cancel; a done or cancelled item is never
  listed, so never opened, and the server refuses its edit with a 409. An item is **cancelled, never deleted** (the row
  keeps `status`). Reads and writes go through `/api/upcoming`: `GET` the open items, `POST {action: add | edit | cancel |
  done}`. The journal read (`/api/journal`) is untouched; upcoming loads beside it, and one failing never blanks the other.
  * **Next 7 days** (the box under the pills on Log, `nextWeek`): open items due within `SOON_DAYS` (7) of the phone's day,
    overdue ones too, soonest first. Absent when nothing is due. **The Upcoming filter** (the last pill of the feed's Show-only
    row; exclusive of the form pills) lists every open item soonest first (`allUpcoming`), with Cancel as well as Done. Both use
    `app/UpcomingList.tsx`: each row wears the pills' status colours (`.lando-pill[data-status]`: due today to 7 days out is
    amber/`yellow`, overdue `red`, later neutral; `upcomingTone`, by calendar day on the phone's day). The first line reads
    "Title · note" and truncates (`titleLine`); the second keeps the due date, "overdue" and the repeat (`detailLine`). The tone
    is in words for screen readers, placed right after the title: a span placed after a long note would widen the page.
  * **A future When** (`isFutureWhen`, or `isFutureDay` for a weight, which is a day): the form says "Future: saves as upcoming",
    shows a **Repeat** (every N weeks, months or years; only then), hides Box 3 (the attachments stay, TEC-203), and Save reads
    "Save as upcoming". Save posts an upcoming item through `onUpcoming` (awaited: a refusal stays on the form) and writes no journal
    entry. The item's kind comes from the form (`futureKind`): a Vet visit is `vet`, a Medication `medication`, everything else
    `other`; its title is the form's name (`futureTitle`: "Potty", "Training", "Medical issue", "Vet visit · Check-up",
    "Name · 5 mg"), which is how Done finds the form again. A saved entry cannot be moved to the future (the form says so, and
    the server refuses a time past a day ahead as before). A When in the same minute as now is not the future.
  * **Done** (`formForItem`, in `doneUpcoming`): a vet visit or vaccine opens the Vet visit form, a medication the Medication tab,
    an Other titled with a form's name that form (Medical issue opens Health on Medical issue), prefilled (`donePrefill`: the
    item's day and time **once they have come**, else the form's own "now", so a Done before the day is never a second future
    entry; a vet visit's reason from `visitPrefill` or a form-made title; a medication's pick, dose and unit from its title; the
    note is the item's note, plus its title when that is its own words). An old Other item with its own words (no form) is marked
    done at once with today's date, as TEC-192 did; an old medication item now opens the Medication form (pick and dose empty
    when its title names no listed medication). The form's entry then closes the item: `Journal`'s `visitLinks` maps the saved
    entry's id to the item, and `saveThenClose` posts `done` with `done_event` once it is saved. Closing the form without saving
    never closes the item; a failed save keeps its Retry, which closes the item when it lands. The server still refuses to close
    a vet or vaccine item without a saved vet visit's id (`applyAction`); medication and Other take any entry.
  * **A repeat**: the server inserts the next open item at `nextDue` (weeks add 7 days each; months and years land on the same
    day, or the last day of a shorter month, so Jan 31 + 1 month is Feb 28/29), same kind, title, note, time and repeat. If that
    insert fails the item is put back to open so Done can be tried again.
  * No phone notifications (the owner's pick); the box on Log and the colours are the whole reminder.
- **Log** (TEC-199, pills and buttons rolled back by TEC-202): four since-last pills in one row (Pee, Poop, Meal, **Fun**; label
  over value, the clock time in the title and for screen readers; coloured by TEC-142, below) that **are buttons once the journal
  has loaded** and open a quick log (TEC-181, TEC-186; `quickLog`, `QuickLog`, `TREAT_QUICK_LOG` in `lib/events.ts`, prop `quick`
  on `LogForm`): Pee or Poop open Potty with that one picked, Meals opens Food on the last meal's item and amount, Fun opens Fun;
  before the journal loads they are plain boxes. Then the **Next 7 days** box when anything is due, then **four buttons in one
  row** (Treats, Training, Weight, Health; Treats opens Food on a treat; Weight keeps "7.3 lb" as a small second line, the date in
  its title). **There is no Potty, Food or Fun button** (TEC-199 added them, TEC-202 took them out at the owner's word). A `quick`
  is ignored when correcting an entry, so a Potty opened from a feed row keeps its saved values. Then "Logging as",
  then the **Feed** under a row of filter pills (TEC-171, below). Potty opens with nothing preselected (TEC-199) unless a Pee or Poop pill opened it. No
  growth chart on Log since TEC-129: it lives in Analytics only. Each button opens a bottom sheet (`app/Sheet.tsx`) with that form
  (`app/LogForm.tsx`, prop `form`). Tapping a feed row opens the matching form on that entry to correct or delete it.
- **Every form is boxed and compact** (TEC-199, `app/LogForm.tsx`; the order is held by `tests/boxedforms.test.ts` through
  `data-section`): **Box 1** When and Logging as on one line (the form's old "Human" label; When is as wide as its label, "Now" or "Tue 8:00 AM", both boxes exactly 44px tall), with the future line and Repeat under
  them when the When is in the future; **Box 2**, the entry; **Box 3**, the secondary things (Potty: the treat count then
  Medical issue on one line; Training and Fun: the treat count, and Fun's Pee/Poop buttons; Vet visit: Medical issue; none on Food,
  Weight, Medical issue or Medication); then **Note** (a full-width `<textarea>`, two rows, scrolling past two; required for a vet
  visit or an issue, optional elsewhere), **Attachments** under it on every form (TEC-203), and Save
  last. Per form, Box 2: *Potty* What (Pee, Poop, Both, No potty; **nothing preselected, and a save without one is refused**) ·
  Where with Leash (outside) or Spot (inside) on one line · Time outside (outside). *Food* Type (Meal, Snuffle mat, Treat) · What
  and a small Amount on one line (the scroller is `SCROLLER_WIDTH` 44, it was 88 then 52; the unit is a small word beside it, not in the label; a treat's count box is 52px). *Training* Where and Time on one line ·
  Commands practised and Other dogs on one line (a half-width native multi-select beside the dogs pick; the "Picked:" line shows
  only when something is picked). *Fun* Type · Where and Length · Other dogs. *Weight* weight and unit on one line. *Health* Type
  (Vet visit, Medical issue, Medication) then each tab's own fields. **Compact controls**: chips, pills, buttons, pick lists and
  field boxes size to their content with narrow padding (`px-2.5 py-1` chips, `px-2 py-1.5` boxes) and wrap; the 44px touch target
  is kept as the hit area (a chip's `label` or `button` is 44px tall and the chip is its inner span; boxes are `min-h-[44px]`).
  The Potty form lost its extra boxes and helper text (the accident line, "Defaults are filled in"); nothing else changed in the
  data. Only existing tokens are used (the boxes are `paper` on the sheet's `surface`, inputs `surface`).
- **Field widths** (TEC-202): the shared `input` class in `LogForm.tsx` carries **no width**; `inputFull` (`input` plus `w-full`) is for
  fields that fill their column, and a narrow field (`w-[64px]`, `w-[76px]`, `w-[96px]`, `w-auto`) is built on `input`.
  **Trap:** Tailwind emits `.w-full` after `.w-[..]` and `.w-auto`, so a `w-full` inside the shared class beats every narrow width
  (it made Dose cover the Medication pick). `tests/fieldwidths.test.ts` holds it.
- **Health** (TEC-137, reworked by TEC-139, **Medication added by TEC-199**): a sixth form, kind `health`, with a Type of **Vet
  visit**, **Medical issue** or **Medication**. A vet visit and an issue have **one plain full-width `<select>`** of high-level picks
  (styled like Other dogs'), a required **Note** ("What happened?"), up to `MAX_PHOTOS` (6) photos, and the usual When and Logging
  as. Vet visit: Check-up, Vaccines, Sick or injured, Procedure (spay/neuter, dental), Follow-up, Other (`VET_REASONS`). Medical
  issue: Stomach & appetite, Skin, ears & eyes, Limping or injury, Breathing or cough, Energy or behaviour, Other (`ISSUE_PICKS`,
  both in `lib/events.ts`). A new entry opens on "Pick one…" and Save without a pick says so. Switching the Type keeps the pick
  only if the other list shares it ("Other"). Stored shape: `{type: vet|issue, reasons[], photos?[], issue?: uuid}` (`issue` on a
  vet visit only, migration `lando_issue_links`), `reasons` an array of one for every new entry; the story is the event's own
  `note`. Feed: "Vet visit  Check-up · 2 photos" with up to four 40px thumbnails and the note after it; the chip is Health.
  Analytics and the since-last pills ignore it.
- **Medication** (TEC-199, `lib/medications.ts`): a Health entry of Type Medication, one dose. Its Box 2 is **Medication (a pick
  list), Dose and Unit on one line**, **Given** (By mouth, On skin, Ear/eye, Shot; opens on By mouth), and **For a medical issue**
  (the same checkbox and select as a vet visit's). Stored shape `{type: 'medication', med_id, med_name, dose, unit, route, issue?,
  photos?}`: **no `reasons` key**; `med_name` is a snapshot taken by the server from the medication (the phone's is ignored,
  like a food's), `dose` is above 0 and at most `DOSE_MAX` (10 000), `unit` one of `MED_UNITS` (mg, ml, g, tablet, chew, capsule,
  spray, dose) and `route` one of `MED_ROUTES` (mouth, skin, ear-eye, shot). **The note is optional** (a vet visit's and an issue's
  stay required), so `parseNewEvent` reads the details first. `checkHealthReasons` and `healthPickFor` pass a medication
  untouched. The feed reads "Medication  Name · 5 mg · by mouth". The medications live in **`lando.medications`** (migration
  `lando_medications`): id (uuid), name (1 to 60 characters, unique ignoring case and outer spaces), unit (the unit the pick opens
  on), created_at, retired. RLS on, zero policies. There is no list in code and **none is seeded**: the pick list starts empty and
  ends with **"Add a medication…"** (`MED_ADD`, never a value, like Add a food): Name and Unit, `POST /api/medications`
  (`journal.ts:addMedication`, `parseNewMedication`: a name already there in any case, retired too, is a 400), merged into the
  loaded list, selected, nothing logged until the form's Save. Read with the journal (`listMedications`, `/api/journal` returns
  `medications`) and, for a dose only, by `writeEvent`. Retire one by SQL (`retired = true`); it leaves the pick list but old
  doses still resolve and can be corrected, a retired one staying selectable on the dose that holds it. Picking a medication sets
  the Unit to its own. A future Medication saves an upcoming item titled "Name · 5 mg".
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
  local pattern: Take photo opens the camera, Attach the library). Each photo is
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
- **Attachments: photos and files on every form and upcoming item** (TEC-203; this widens the Health-photos note above, which
  still holds for pictures). Any file type, up to `MAX_PHOTOS` (6) on an entry; **Take photo** (camera) and **Attach** (any
  file, many). A jpeg/png/webp-like picture is still shrunk on the phone (`isShrinkable`: raster pictures, not GIF or SVG) and
  shown as a thumbnail; anything else goes up as it is and **must be 4 MB or less** (the bucket's limit; `tooBigText`): a bigger
  file is refused on pick with a red line on the form naming it, never dropped silently. A picture this browser cannot decode
  (a HEIC) is sent as a file when it fits, else the shot fails with the reason. **Stored shape**: `photos` is still the list of
  paths (the key name is history's; it holds files too) and a new optional **`names`** holds `{path: original name}` for each
  attachment that is not a picture (pictures need none; `cleanFileName`, at most 120 characters). Old entries have neither and
  stay valid. The path is `health/<uuid>` with an optional `.ext` (`PHOTO_PATH`, `lando.details_ok` holds the same pattern):
  a picture's from its type, a file's from its name (1 to 10 lowercase letters or digits, else none). A path ending in
  jpg, png or webp is a picture (`isImagePath`); every other path is a chip with its type and name (`attachmentLabel`: the name
  kept, else "PDF file"/"File"), a link opening the signed URL in a new tab. `parseAttachments` is the one parse, in every
  kind and in an upcoming item; `names` for a path not in `photos` is dropped. A file is stored with its own content type
  except one a browser would run (html, xml, svg, scripts), which is stored as `application/octet-stream` (`storedContentType`).
  The feed row shows thumbnails and small type-and-name chips (not links: the row is a button; open a file from its entry) and
  "1 photo" / "2 files" / "3 attachments" (`attachmentsText`). **Upcoming items** hold `attachments`
  (`{photos, names?}`, null when none; the column added by `lando_upcoming_attachments`); `GET /api/upcoming` returns a `photos`
  signed-URL map beside `items`; add and edit check every path is in the bucket (`checkAttachments`, `missingPhotos`) as an
  entry does. **A Done carries them**: `donePrefill` hands the item's paths and names to the form, which opens with them
  (editable) and saves them on the entry it creates. A repeating item's **next** occurrence does not carry them (the files
  belong to the visit just done). Migrations, apply in order: `lando_photos_any_file_type` (the bucket's `allowed_mime_types`
  to null; private, 4 MB kept), `lando_upcoming_attachments`, `lando_attachments_details_ok` (the function: Food and Weight
  take `photos`, every kind takes `names`, the path pattern widened).
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
  treat did). The pill's face is **"Meals: N · X cups"** (TEC-194, below; `CLOCK_LABELS` still says Meal for the others' titles); the Food form keeps
  their name because they log treats too.
- **The pills open a quick log** (TEC-181, TEC-186; TEC-199 made them display-only, TEC-202 put them back): `Pill` in
  `Journal.tsx` is a `button` once `clocks` is set, else a `div`; the title ends "tap to log". Fun's own Pee and Poop buttons
  (below) are unchanged.
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
- **The Meal pill's label** (TEC-194, `mealsSummary` / `mealPillLabel` in `lib/events.ts`, `tests/mealpill.test.ts`):
  "Meals: N · X cups" for the phone's day (`localMidnight(now)` to the next midnight, so it rolls at midnight with
  `now`). N is live meals (1 each) plus snuffle mats (0.5 each, TEC-197), written in halves with a ½ glyph, never a decimal
  ("Meals: 2½", "Meals: ½", `formatMealCount`); voids out, treats never, any unit, Misc included. Only this N halves:
  time since last meal, meal gaps, quick-log prefill and the remembered amount still treat a snuffle mat as a meal. X sums only meals whose snapshot unit
  is `cup` (a snuffle mat's usually is) with an amount, rounded to the nearest 1/8 with a floor of 1/8, written as a mixed
  fraction ("⅞ cup", "1⅛ cups", "2 cups"; singular at 1 or less, judged on the rounded value). No cup amount
  today: "Meals: N" (and "Meals: 0"). Before the journal loads it reads "Meals". Only the label changed: tap-to-log
  and the time-since value stay. The title starts with the label and then "Last meal at ..."; the label is the
  visible text, so screen readers get it too. The label may wrap at the dot (the other pills' labels still
  truncate). Trap: it is the one pill whose label is not a constant; do not read `CLOCK_LABELS.food` for its face.
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
  **Photos on both** (TEC-139): the same Photos block as Health (Take photo, Attach, upload
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
  meal amount, or "—" on its first. **Snuffle mat is a food type**
  (TEC-195, `FOOD_TYPES` = meal, snuffle, treat; the Food form's Type choice reads Meal, Snuffle mat, Treat): it picks from the
  **meal list** (`listOf("snuffle")` is `meal`, so `picklist`, `findFood`, `defaultFood` and "Add a food…" all use the meal
  list, and an added food is a meal food: `lando.foods.type` stays meal|treat) and takes the meal amount default. It counts
  as a meal everywhere meal-based (`isMealType` in `lib/foods.ts`: the Meal pill's N and cups, time since last meal,
  meal-to-pee/poop gaps, the food-against-weight chart, the remembered meal item and amount); on the
  per-day counts and timeline it is a meal mark. The feed row is titled "Snuffle mat". A new meal-based check uses
  `isMealType`, never `type === "meal"`. The TEC-193 item `snuffle-mat` is **retired** (kept, still resolves; entries
  logged with it are `type: meal` and still read and correct). Awkward by design: a snuffle mat's item is the kibble in it, so calories follow the item,
  while the retired item has none.
- **The treat count on Potty, Training and Fun** (TEC-199, `app/TreatCount.tsx`; replacing TEC-193's treat pick beside a quantity,
  `TreatRow`, which is gone): "Treats" with − and + around a number, opening on 0, no picker (0 to 99). A count above 0 becomes **one
  food `treat` entry, item Misc, amount = the count** (`inlineTreatEntries` with `MISC_ID`, via `treatEntry`) at the entry's exact
  `at` and Logging as, saved **after** it; 0 saves none. This is the "type of treat dropped, only the number kept" call; **Food's
  Type = Treat still picks a specific treat** (and Add a food…).
  - Its id is fixed when the form opens (`treatId`), so a retry is the same row.
  - New entry: the entry is a pending row carrying the treat (`then`, mirrored in `lando.unsaved` with it). Once it saves, the
    treat is saved as its own row with its own Retry. If the entry fails, its row reads "+ 1 treat" (the entries behind it, not the
    count) with Not saved: Retry saves the entry and then the treat; ✕ discards both (`lib/saveOrder.ts`).
  - Closing the sheet without saving logs nothing. A failed correction keeps the form open, the row intact.
  - **A training's or fun's stored `treats` is a count of treat entries**: a new one stores 1 when the count is above 0, else 0; a
    correction stores the count it had plus 1 for a treat added now. **Fun used to keep a free "Treats used" number of pieces;**
    it now has the count too, with this meaning (it was never read by Analytics; the feed still says "N treats"), so an old Fun
    entry's number and a new one's differ in meaning. Fun's Length box stays.
  - Deleting a training, fun or potty leaves its treats: they were eaten. Delete one from the feed if it was not.
  - A correction shows the treats already logged with it ("Logged: …", `treatsWith`): live food treats at the entry's exact `at`,
    to the millisecond. There is no link column. Moving the entry's When in a correction leaves its treats at the old time. The
    count opens on 0 on a correction too, so nothing already logged is saved twice.
- **Training's commands** (TEC-193, laid out by TEC-199): a native multi-select over `COMMANDS` (a phone shows a checklist) in a half-width
  box beside Other dogs, with "Picked: Sit, Down" under the row once something is picked. The picks are stored exactly as before,
  filtered to the list's order (`parseDetails`).
- **Patch notes** (TEC-182 as "What's new", renamed TEC-199; plain text since TEC-186; `app/WhatsNew.tsx`): the third tab, after
  Analytics. **No cards.** Per day, a line "Oct 27 | a short summary of the day" (bold), then that day's entries as "•" bullets.
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
  same Photos block as Health, Fun and Training (Take photo, Attach, Save waits for each,
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
  `foodSnapshot`, `treatEntry`, `defaultFood`); the Food form's Meal opens on an added
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
- **Person boxes fit a name** (TEC-129): "Logging as" in every form (it was labelled Human until TEC-199) and on Log take an inline
  width from `nameBoxWidth` (`lib/names.ts`): the longest `display_name` in `ch`, at least 6
  (the "Nobody" option) and at most 14, plus one `ch` and room for the padding and arrow. Past
  14 characters the closed box truncates; the open list shows the name whole. The empty options
  read "Nobody" (Human) and "Who?" (Logging as) so they fit.
- **Chart colours** are `--lando-series-1..3` in `app/globals.css`, read from the theme's tone and
  ink tokens; series 2 is burnt orange in light and peach in dark, where the accent is papaya.

## Traps

- **Upcoming's Done is client-linked.** The link from the entry saved by a Done to its item lives in `Journal`'s
  `visitLinks` ref, not in storage. If the entry saves but the phone loses the page before the `done` call
  lands (or the call fails twice), the entry is in the journal and the item stays open; a toast says so. Tapping
  Done again would log a second entry, so check the feed first and Cancel the item (the Upcoming filter) instead. An entry left unsaved
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
- **Medications are history's key, and the journal read needs the table.** An entry holds a medication's `med_id` in jsonb, so no
  foreign key protects it: never delete a row or change its id; retire with `retired = true`. `/api/journal` reads
  `lando.medications` with the events, so code merged before `lando_medications` is applied makes every journal load a 503
  (a dose's write needs it too). **Deploy order: `lando_medications`, then `lando_medication_entries`, then the code.** The unit
  and route lists are in three places each (`MED_UNITS` / `MED_ROUTES`, the table's check, `lando.details_ok`); `tests/boxedforms.test.ts`
  holds them equal. The word `drop` is not a medication unit: `tests/health.test.ts` bans it from the newest function file's
  text, so the list uses `g`, `spray` and `dose` instead.
- **Done on a form-made item finds the form by the item's title** (`formForItem`): "Potty", "Food", "Fun", "Training", "Weight" and
  "Medical issue" are `FORM_TITLES`, so a new Other item whose title is one of those opens that form on Done. An old Other item
  that happens to carry one of those words as its own title would open the form too. A medication's dose and a vet visit's reason
  are read back from the title ("Name · 5 mg", "Vet visit · Check-up"), not stored on the item; the Given route is not kept.
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
  (today `lando_medication_entries`, which is `lando_snuffle_type`'s body with health wrapped in a CASE: a new `medication` branch, and the
  old vet and issue shape as its ELSE, unchanged; `lando_snuffle_type` is `lando_box_leash_spot`'s body plus `'snuffle'` in the food type list;
  that one is `lando_potty_minutes`'s body plus `'box'` in the leash and spot lists;
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
- **The food type list is in two places:** `FOOD_TYPES` in `lib/foods.ts` and the food branch of `lando.details_ok`
  (`IN ('meal', 'snuffle', 'treat')`, migration `lando_snuffle_type`). A type in the app alone fails every save of it with a
  503. `tests/snuffle.test.ts` reads the migration. Deploy order: the migration first, then the code.
- **The health lists are in two places:** `VET_REASONS` + `VET_RETIRED` and `ISSUE_PICKS` +
  `ISSUE_RETIRED` in `lib/events.ts` and `lando.details_ok`. The database holds the union.
  `tests/health.test.ts` reads the newest migration defining the function (by version; it must be
  no older than `lando_health_picklist`) and fails if its two reason arrays differ from the code's
  unions or drop an id `lando_health_events` held, if it lacks the health branch, the
  `MAX_PHOTOS` bound, the `PHOTO_PATH` pattern or exercise's `photos` and `names` keys, or if that file holds
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
- **The upload is one request under Vercel's body limit** (about 4.5MB; the route and the
  bucket cap at 4MB). The canvas downscale is what keeps a phone shot under it; a file that is not shrunk is held to 4 MB
  on the phone and again by `photoPath` on the server. If a browser cannot decode a picture (a HEIC) it goes up as a file
  when it fits; over 4 MB it fails with the reason and Retry will fail again until it is removed.
- **The attachment shape is in three places:** `parseAttachments` / `PHOTO_PATH` (`lib/events.ts`), `photoPath` (`lib/storage.ts`,
  which makes the path) and `lando.details_ok`. A path pattern or a `names` rule in the app alone fails every save of it with a
  503. `tests/attachments.test.ts` reads the newest function's text for the pattern and the keys; the paths a file can take
  (`nameExt`) must stay inside `PHOTO_PATH`.
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
