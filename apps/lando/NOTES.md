# Lando — notes

## State

- v2 on Next.js 16: two tabs under the app bar, **Log** and **Analytics**, sticky, opening on Log
  (the owner's override of the one-screen rule, in RULES.md).
- **Log**: four since-last pills in one row (pee, poop, food, exercise; label over value, the
  clock time in the title and for screen readers), "Logging as", four section buttons in one row
  (Potty, Food, Exercise, Weight: label only, no description, 52px tall; the newest weight is in
  the Weight button's title and screen-reader text), today's timeline under four filter chips
  (TEC-129). No growth chart on Log since TEC-129: it lives in Analytics only. Each
  button opens a bottom sheet (`app/Sheet.tsx`) with the form for that kind (`app/LogForm.tsx`),
  defaults filled in, so Save is usually the only other tap. Tapping a timeline row opens the same
  form on that entry to correct or delete it.
- **Today's filter**: chips Potty, Food, Exercise, Weight (`LOG_KINDS`) between the Today heading
  and the feed. Tap one to show only that kind (unsaved rows too), tap it again for all; still
  today only, newest first. Food covers meals and treats. Held in memory, not remembered: every
  open starts on all. An empty filtered day reads "No potty entries yet today." and so on.
- **Analytics** (`app/Analytics.tsx`): the last 14 of the phone's local days: weight trend (the
  growth chart over the window, with its table), potty per day (pee, poop, accidents stacked, plus an accident-trend
  line), food per day (meals, treats), exercise per day (walks, playtime, training, plus average
  sessions and minutes). Plain SVG (`app/StackedBars.tsx`); tap a day for its numbers.
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

- **Four kinds plus `void`** (`lib/events.ts`). `details` per kind, every key required unless
  marked `?`: potty `{what: pee|poop|both|none, where: outside|inside, leash?: leashed|unleashed|pen}`
  (inside = an accident: warned in the form, red in the timeline, counted apart in Analytics;
  `leash` only when outside); food `{type, item_id, item_name, kcal_per, unit, amount}`; exercise
  `{type: walk|playtime|training, where, with_dogs, minutes, treats, commands?, dogs?}` (commands
  on training only, from the fixed list `COMMANDS`; `dogs` is 1 to 20 `lando.dogs` ids, only when
  `with_dogs` is true); weight `{value, unit}`. `parseDetails` checks these on the phone (before
  the sheet closes) and again on the server; the database's `events_details_shape` check
  (migration `widen_lando_potty_none`, which replaced `widen_lando_events_details_shape`'s) holds
  the same shapes. Entries from before
  `leash` and `dogs` (TEC-125) have neither and read as before: "pee", "with dogs".
- **No potty** (`what: "none"`, TEC-129; the owner's label, POTTY_WHAT_LABELS): a trip out with
  nothing done. It keeps Where and, outside, Leash, like any potty. It resets neither the pee nor
  the poop clock, is never an accident (`isAccident`; inside hides the accident warning and the
  row is not red), and counts as nothing in Analytics' per-day rows. The timeline reads
  "no potty · leashed" or "no potty, inside".
- **Potty's Leash pick** (Leashed / Unleashed / In pen) shows only while Where is Outside, and
  defaults to Leashed on a new entry. It is not remembered per phone. Correcting an old outside
  entry that has none opens with nothing picked, so a correction never invents one. The timeline
  shows it after the what: "pee · unleashed".
- **Exercise's Other dogs** is one pick (TEC-129, replacing TEC-125's multi-select): a plain
  full-width `<select>`: None, every row in `lando.dogs` by name, Multiple, "Add dog…". There is
  no Yes/No. `dogsFromPick` (`lib/events.ts`) maps the pick: a dog saves `with_dogs: true,
  dogs: [id]`; Multiple saves `with_dogs: true` and no `dogs`; None saves `with_dogs: false`.
  Add dog never becomes the value: it swaps the select for a name box with Add and Cancel (Enter
  adds; it is not a nested form, so Enter does not save the session), and the new dog is then
  picked. `dogsPickFor` opens a correction: one listed dog opens on it; `with_dogs` with no ids
  (Multiple, or an entry from before TEC-125) opens on Multiple, which saves the same shape; an
  entry naming several dogs, or one no longer listed, opens on an extra option showing those
  names (`DOGS_KEPT`) and saves them unchanged until another pick is made. The timeline names
  them: "with Dog A, Dog C"; `with_dogs` and no ids reads "with dogs"; an id no longer in the table
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
  today at noon, also when saved before noon. The timeline shows a weight's row by day
  (`rowTime`); the growth chart was already by day. Weights from before this keep their
  logged time. Every other form keeps date and time.
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
  and a `void` is never live. Pills, timeline, charts and Analytics read live events only.
- **Writes** (`POST /api/events`) are inserts only: a new entry, a correction (same kind, `voids`
  the old one, keeps its time unless a new one is sent) or a delete (`kind = 'void'`, at the
  database's now). The phone chooses each id, so saving the same entry twice returns the first row.
- **The database backs it** (migration `lando_people_and_events`): UPDATE and DELETE on
  `lando.events` raise; `voids` is unique, so a second change to one entry is a 409 and the screen
  reloads; a `void` must name its target and carry `{}`.
- **Pills**: an inside potty still resets its pee or poop clock; both resets both. A time in the
  future is ignored. Nothing in 30 days reads "none". Values never exceed six characters
  (`formatAgo`: "47m", "2h 5m", "14h", "3d 4h", "12d").
- **Save never waits.** The sheet closes at once; the entry shows as "Saving…" and then joins the
  timeline, or stays as "Not saved" with Retry. Unsaved entries are mirrored to `localStorage`
  (`lando.unsaved`) and retried on the next open. Corrections and deletes are awaited in the sheet
  and show their error there.
- **People** are typed in the app (`POST /api/people`); a name already there in another case is
  returned, not duplicated.
- **Per-day aggregation** (`lib/analytics.ts:perDay`): days are built with the calendar
  (`new Date(y, m, d - i)`), never by subtracting 24 h, so a DST change cannot shift an evening.
  Averages count complete days only, from the first day anything was logged.
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

- The Supabase exposed-schemas list is outside the repo. Without `lando` on it, every read fails as
  a permissions error that reads like a bad key; `/api/health` probes `lando.events`.
- **The food catalogue is history's key.** Never delete an item or change its `id`: mark it
  `retired: true`, or its old entries can no longer be corrected (the server refuses an unknown
  `item_id`). Changing a name or calorie figure is safe; old entries keep their snapshot. A new id
  must match `^[a-z0-9-]{1,60}$` or the database refuses it.
- **A new detail field needs three edits:** `parseDetails` in `lib/events.ts`, the
  `events_details_shape` check (a new migration; see the swap trap below), and the tests. The
  check allows no unknown key, so a field added in the app alone fails every save with a 503.
- **`events_details_shape` is replaced by a DROP and an ADD in one ALTER**, and the connector
  cannot run a DROP. Any further widening is a new migration the owner runs in the SQL Editor
  inside `begin; … commit;` with its `schema_migrations` row, as
  `widen_lando_events_details_shape` and `widen_lando_potty_none` were. Copy the whole current
  check into it (now `widen_lando_potty_none`'s): the ADD replaces every shape, not just the one
  that changes.
- **The potty `what` list is in two places:** `POTTY_WHAT` in `lib/events.ts` and the
  `events_details_shape` check. A value in the app alone fails every save of it with a 503.
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
- The training command list is in two places: `COMMANDS` in `lib/events.ts` and the
  `events_details_shape` check. Add a command to both.
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
