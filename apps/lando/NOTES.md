# Lando — notes

## State

- v1 on Next.js 16: since-last clocks (pee, poop, meal), seven one-tap log buttons, who is logging,
  today's timeline with edit and delete, and a growth chart from weights, all on one screen.
- The gate file is `proxy.ts`, the base copy. Not yet in the hub's `TOOLS`
  (`apps/home/lib/platform.ts`); that is a separate home change, and until it lands The Garage
  does not probe `/api/health`.
- Livery `mcl39` (McLaren '25: papaya on anthracite), worn by Lando alone. The theme files carry
  it because this branch merged `claude/home-papaya-livery`.
- The icon is Lando in a racing helmet, visor up (`app/icon.svg`, concept A, the owner's pick). It
  is a hand-drawn vector of the real dog: a chocolate-dapple and white miniature dachshund with a
  white blaze, chocolate over both eyes, tan eyebrow dots and cheeks, amber eyes, a liver nose and
  long speckled ears hanging below the helmet. The helmet and tile are the mcl39 colours copied
  from `lib/theme.css`; the dog keeps his own. It is inspired by the livery: no team mark,
  wordmark, number or sponsor. `favicon.ico` (16, 32, 48, RGBA PNG frames),
  `apple-touch-icon.png` (180, full-bleed, opaque) and `manifest-192/512.png` (rounded, RGBA) are
  rendered from it; re-render all four when it changes.
- A web app manifest at `/app.webmanifest` (a route, `app/app.webmanifest/route.ts`) for Chrome's
  install. No other app has one.

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
