# Pit Row — notes

## State

v1, This week (#44, TEC-276), on Next.js 16, copied from `apps/grid` and `apps/lando`. **Not live until the owner's
outside steps are done** (Vercel `tp-pitrow` with Root Directory `apps/pitrow` and Node 24, env vars, DNS, the login
rate limit, `pitrow` in Supabase's exposed schemas, a `FORCE_BUILD` rebuild). It is in `TOOLS`
(`apps/home/lib/platform.ts`) with a 🧹 sidebar icon (`apps/home/app/apps.ts`), so The Garage and Smoke probe it.

- **Livery `clark`** (same green as Grid and Cookbook): nothing fixes one. `lib/livery.ts` is the one line to change.
  The icon (`app/icon.svg`: three rows, the first ticked) and the PNGs and `favicon.ico` rendered from it were drawn
  for this app; the PNGs were made with a throwaway PIL script, not a tool in the repo.
- **One screen** (`app/Week.tsx`): the Sunday-to-Saturday week containing today (the device's own day, `lib/days.ts`
  `localDay`; the server never works out "today"), a card per day (`app/DayCard.tsx`). Today's card is open and
  scrolled into view on the first read; a tap on any day header opens or closes it in place. Previous and next week
  buttons page the same read by `?start=`. Layout: one column on a phone, two from 768px, three from 1024px.
- **Always on:** `load()` runs on mount, every minute (`REFRESH_MS`), on `focus` and when the page turns visible, and
  after every save. A read that was overtaken by paging is dropped. A failed read of Pit Row's own data keeps what was
  last read and shows "Can't reach Pit Row" with the time of that read.
- **Events** come from `GET /api/week` calling the stamped `fetchCalendarWeek` (`lib/calendar-client.ts`, shared) at
  Grid's `GET /api/calendar/week`, forwarding only `paddock_session`. **A failed calendar read is its own state**: the
  route answers `events: {ok: false, error}` with the chores intact, the page shows an "Events unavailable" banner and
  every open day says so where its events would be, and the day summaries read "events unavailable". Never "No events".
  `not_connected` is expected until the owner connects Outlook (#69).
  * Events from the **"Pit Row" calendar are left out** (`OWN_CALENDAR` in `lib/week.ts`): they are the chores sent
    there, which the board already shows. If that calendar is renamed, the chores will show twice.
  * A timed event shows on the day it starts; an all-day event on each day from `start` to `end` inclusive. Times are
    Denver wall-clock strings and are shown as they are, never converted.
- **Chores** (`pitrow.chores`): once, daily, weekly on weekdays (0 Sunday), or every N days (2 to 365), counted from
  `start_on`. A **once-only chore is done whenever it was ticked** and, undone past its day, is carried onto today as
  "Overdue" (today's card only). Retire sets `archived_at`; nothing is deleted. A retire is two taps.
- **People** (`pitrow.people`): names, retired not deleted. A retired person's past ticks still show, not tappable.
- **Ticking is a tap on a name.** A tick is a `completions` row (chore, day, person); tapping a ticked name inserts a
  **void** row (`voids` names the tick) rather than touching it. A tick is live until a void names it (`liveTicks`
  in `lib/db.ts`). Completions are append-only in three places: the route exports POST only, `lib/db.ts` only
  upserts with ignore-duplicates, and the table's trigger refuses UPDATE and DELETE for every role. `voids` is unique;
  a retried void that hits it is treated as already done. Future days cannot be ticked.
- **Saving** (`app/outbox.tsx`, copied from Grid) is "never lose a tap": every write is `{url, body}` with ids from
  the browser, a failed one stays in a sticky "Not saved" banner with Retry and Discard and in `localStorage`
  (`pitrow.unsaved`). A tick shows its intended state dimmed until the re-read comes back, and reverts on failure.
- **Chores go to the "Pit Row" calendar** after a save (`lib/calendar-map.ts`): all-day, `app: "pit-row"`,
  `source_id` the chore id, title the chore's alone (no one's name goes to a shared calendar), recurrence as the
  cadence (every N days is `daily` with `interval`). A retire sends a delete. A retried add of a retired chore sends
  nothing. A calendar failure never fails the save; there is no backfill, so a chore saved while Grid was down only
  reaches Outlook on its next send (nothing re-sends it today).
- **API:** `GET /api/week?start=`, and `POST` on `/api/people`, `/api/chores`, `/api/completions`, each `{op, ...}`
  parsed by `lib/validate.ts`. A refusal's message never repeats what was typed and nothing logs (a test greps for
  `console.`). A database error is reduced to its code.
- **`/api/health`** is signed in only and reads one `pitrow.people` id: it fails as a permissions error when `pitrow`
  is missing from the exposed-schemas list.
- **Installable** through `/app.webmanifest` (`display: fullscreen`; iOS ignores it and uses the
  `apple-mobile-web-app-capable` tag in `app/layout.tsx`). The theme and logout buttons on the app bar are the stamped
  shared controls, so they keep their own sizes, under the 56px target.

## Not proven by any test

On the real iPad (Safari, iPadOS 17 or later): the layout in landscape and portrait, the 56px targets by finger,
install to the home screen and full-screen launch, the date and select inputs in the Chores form, the refresh on
focus after the iPad sleeps, and that the page stays signed in. Live events wait on Grid's `GET /api/calendar/week`
(#74) and the Outlook connection (#69).

## Traps

- The week read depends on Grid's route answering the shape in `lib/calendar-client.ts`; an answer that disagrees with
  it is read as `unavailable`, not trusted.
- `supabase/README.md` still lists the schemas without `pitrow`: Grid's slice owns that file.
