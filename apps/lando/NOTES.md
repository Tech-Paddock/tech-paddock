# Lando — notes

## State

- v2 on Next.js 16: two tabs under the app bar, **Log** and **Analytics**, sticky, opening on Log
  (the owner's override of the one-screen rule, in RULES.md).
- **Log**: four since-last pills in one row (pee, poop, food, exercise; label over value, the
  clock time in the title and for screen readers), "Logging as", four section buttons (Potty, Food,
  Exercise; Weight shows the newest weight in big type), today's timeline, the growth chart. Each
  button opens a bottom sheet (`app/Sheet.tsx`) with the form for that kind (`app/LogForm.tsx`),
  defaults filled in, so Save is usually the only other tap. Tapping a timeline row opens the same
  form on that entry to correct or delete it.
- **Analytics** (`app/Analytics.tsx`): the last 14 of the phone's local days: weight trend (the
  growth chart over the window), potty per day (pee, poop, accidents stacked, plus an accident-trend
  line), food per day (meals, treats), exercise per day (walks, playtime, training, plus average
  sessions and minutes). Plain SVG (`app/StackedBars.tsx`); tap a day for its numbers.
- The design is the prototype artifact `https://claude.ai/artifact/XdiVZzBqyzeQEVxwXyqAfv`, built
  with the theme's tokens; its sample data and made-up history are not in the app.
- The gate file is `proxy.ts`, the base copy. Not yet in the hub's `TOOLS`
  (`apps/home/lib/platform.ts`); that is a separate home change, and until it lands The Garage
  does not probe `/api/health`.
- Livery `mcl39` (McLaren '25: papaya on anthracite), worn by Lando alone. The theme files carry
  it because this branch merged `claude/home-papaya-livery`.
- The icon is Lando in a racing helmet, visor down (`app/icon.svg`, concept A, the owner's pick).
  The visor is smoked anthracite at 0.35 opacity with a highlight streak and a faint papaya
  reflection, so his face reads through it. It is a hand-drawn vector of the real dog: a chocolate-dapple and white miniature dachshund with a
  white blaze, chocolate over both eyes, tan eyebrow dots and cheeks, amber eyes, a liver nose and
  long speckled ears hanging below the helmet. The helmet and tile are the mcl39 colours copied
  from `lib/theme.css`; the dog keeps his own. It is inspired by the livery: no team mark,
  wordmark, number or sponsor. `favicon.ico` (16, 32, 48, RGBA PNG frames),
  `apple-touch-icon.png` (180, full-bleed, opaque) and `manifest-192/512.png` (rounded, RGBA) are
  rendered from it; re-render all four when it changes. The favicon's 16px frame alone is drawn
  from a variant: visor tint 0.22, no streak or reflection, since at 0.35 the face greys out at
  16px. The SVG's header comment says so; keep that frame lighter on any redraw.
- A web app manifest at `/app.webmanifest` (a route, `app/app.webmanifest/route.ts`) for Chrome's
  install. No other app has one.

## How it works

- **Four kinds plus `void`** (`lib/events.ts`). `details` per kind, every key required:
  potty `{what: pee|poop|both, where: outside|inside}` (inside = an accident: warned in the form,
  red in the timeline, counted apart in Analytics); food `{type, item_id, item_name, kcal_per,
  unit, amount}`; exercise `{type: walk|playtime|training, where, with_dogs, minutes, treats,
  commands?}` (commands on training only, from the fixed list `COMMANDS`); weight `{value, unit}`.
  `parseDetails` checks these on the phone (before the sheet closes) and again on the server; the
  database's `events_details_shape` check holds the same shapes.
- **Food catalogue** (`lib/foods.ts`), fixed in code; Misc last in each list, no "add another".
  The server builds the food snapshot (name, kcal-per, unit) from the catalogue by `item_id`;
  whatever the phone sends for those is ignored. **Calories are recorded and never shown.** Each
  figure's source is a comment on its item.
- **Defaults per phone** (`lib/defaults.ts`, `localStorage`): `lando.person` (asked once on a
  phone's first open, "Whose phone is this?"), `lando.defaults` (last meal item, last treat item,
  last weight unit, last meal amount). A first log defaults to Misc. Treats default to an amount of
  1; exercise to a 15-minute walk outside, no other dogs, no treats; potty to pee outside; "when"
  to the moment Save is pressed unless it was changed.
- **One read** (`GET /api/journal?since=`, `lib/journal.ts:readJournal`): `since` is the phone's
  local midnight. It returns the 30 days before it (`HORIZON_DAYS`), every weight ever, every
  voiding event, and all people. Paged; past 20 000 rows it fails rather than reading short.
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
  zero, tap for the nearest point, a table underneath; `since` limits it to a window.
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
  `events_details_shape` check (a new migration once this one is applied), and the tests. The
  check allows no unknown key, so a field added in the app alone fails every save with a 503.
- The training command list is in two places: `COMMANDS` in `lib/events.ts` and the
  `events_details_shape` check. Add a command to both.
- Tailwind's `flex` beats the `hidden` attribute, so the tab panels also switch their class.
- `datetime-local` is a native control; at 390px Chrome clips the end of "10:30 PM" in the When
  field. The value is right; only the display is cut.
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
  vector shapes; never an `<image>` in the SVG.
- `tsc` cannot resolve the PNG imports until `next build` (or `next dev`) has written
  `next-env.d.ts`, which is not tracked. Build first on a fresh checkout.
- `app/icon*.png` is a Next metadata convention; the manifest PNGs are named `manifest-*.png` so
  Next does not treat them as icons.
