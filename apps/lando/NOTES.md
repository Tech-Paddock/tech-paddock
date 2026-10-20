# Lando — notes

## State

- v1 on Next.js 16: since-last clocks (pee, poop, meal), seven one-tap log buttons, who is logging,
  today's timeline with edit and delete, and a growth chart from weights, all on one screen.
- The gate file is `proxy.ts`, the base copy. Not yet in the hub's `TOOLS`
  (`apps/home/lib/platform.ts`); that is a separate home change, and until it lands The Garage
  does not probe `/api/health`.
- Livery `clark`, which Cookbook also wears.

## How it works

- **One read** (`GET /api/journal?since=`, `lib/journal.ts:readJournal`): `since` is the phone's
  local midnight. It returns the 30 days before it (`HORIZON_DAYS`), every weight ever, every
  voiding event, and all people. Paged; past 20 000 rows it fails rather than reading short.
- **Live events** (`lib/events.ts:liveEvents`): an event is live when no event's `voids` names it,
  and a `void` is never live. Clocks, timeline and chart read live events only.
- **Writes** (`POST /api/events`) are inserts only: a tap, a correction (same kind, `voids` the
  old one, keeps its time unless a new one is sent) or a delete (`kind = 'void'`, at the database's
  now). The phone chooses each id, so saving the same tap twice returns the first row.
- **The database backs it** (migration `lando_people_and_events`): UPDATE and DELETE on
  `lando.events` raise; `voids` is unique, so a second change to one entry is a 409 and the screen
  reloads; a `void` must name its target.
- **Clocks**: an accident marked pee or poop resets that clock; an unmarked one resets neither. A
  time in the future is ignored. Nothing in 30 days reads "none".
- **Taps never wait.** A tap is shown as "Saving…" and then joins the timeline, or stays as "Not
  saved" with Retry. Unsaved taps are mirrored to `localStorage` (`lando.unsaved`) and retried on
  the next open. Meal, Training and Weight open their editor once saved.
- **People** are typed in the picker (`POST /api/people`); a name already there in another case is
  returned, not duplicated. The phone remembers its pick in `localStorage` (`lando.person`).
- **Growth chart** (`app/GrowthChart.tsx`, a local SVG pattern): live weights with a value, in the
  newest weight's unit, y axis from zero, tap for the nearest point, a table underneath.

## Traps

- The Supabase exposed-schemas list is outside the repo. Without `lando` on it, every read fails as
  a permissions error that reads like a bad key; `/api/health` probes `lando.events`.
- A weight tapped without a value is stored with empty details and is not on the chart until
  corrected. Its row reads "no value yet".
- `TRUNCATE` is not covered by the append-only trigger.
- Next 16 drops `apple-mobile-web-app-capable` unless `metadata.other` in `app/layout.tsx` writes it.
- Turbopack refuses an ICO whose PNG frame is not RGBA; `app/favicon.ico` is RGBA.
