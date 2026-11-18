# Grid — notes

## State

v1, the daily page (#43, TEC-275), on Next.js 16, copied from `apps/lando`. Not yet live: it waits on the
two migrations, the calendar's two (below) and the owner's outside steps (a Vercel project `tp-grid`, env vars, DNS, the login rate
limit, the `grid` and `calendar` exposed schemas, a `FORCE_BUILD` rebuild; paddock-issues #55). It is in `TOOLS` in
`apps/home/lib/platform.ts`, with a 🗓️ icon in the sidebar (`apps/home/app/apps.ts`), so The Garage and Smoke
probe it, and that probe is red until #55 is done. That is not a regression.

- **Livery `clark`** (Lotus '63, green), the builder's pick: nothing fixes one, and it shares it with Cookbook.
  `lib/livery.ts` is the one line to change. There is no livery badge on the app bar, only the name, theme and logout.
- **Today** (`app/Today.tsx`) is the one screen: Tasks, Routines, Journal, Meditation, then a quiet "Goals and
  lists" link to `/more`. It reads the device's own calendar day after mount (`lib/days.ts` `localDay`; the server
  never works out "today", it runs in UTC), asks `GET /api/today?day=` for everything in one read, and reads again
  after every save and whenever the app returns to the foreground, so a page left open past midnight turns over.
- **Saving** (`app/outbox.tsx`) is the heart of "never lose a tap". Every write is plain data `{url, body}` sent by
  `send(label, url, body)`. A write that does not answer ok stays in a sticky "Not saved" banner with Retry and
  Discard, and is kept in `localStorage` under `grid.unsaved`, so a closed tab does not drop it. **Nothing shows as
  saved that the server did not answer ok for:** adds clear their box at once (the outbox now holds them) but the
  list only changes when the re-read comes back; a tick shows its intended state (dimmed) while in flight and
  reverts on failure.
  * **Ids come from the browser** (`lib/uuid.ts`) and every create is `upsert ... ignoreDuplicates` on that id, so a
    retry lands once. A retried journal save is the same version id.
  * A 400 (an invalid body) is retried like anything else and will fail again; Discard clears it. It cannot happen
    from the UI's own forms, which check first.
- **Tasks:** `tasks.done_on` is the browser's day it was ticked (not a timestamp), so "done today" needs no
  time zone. Today lists open tasks due today, earlier or undated (overdue first), what was ticked done today, and
  later-dated ones behind "Later (n)". Tasks done on an earlier day drop off Today and there is no page to see
  them: a known v1 gap. There is no delete.
- **Routines:** a name and weekdays (0 Sunday to 6, `getUTCDay` of the day string). One `routine_ticks` row per
  routine per day; unticking deletes it. Today shows the ones whose weekdays include the day. Retire (set
  `archived_at`, never delete) is on `/more`.
- **Journal is append-only** (RULES.md, Never 1), in three places: the route exports `POST` only and has one op,
  `save`; `lib/db.ts` only upserts with ignore-duplicates; and the table's trigger
  (`journal_is_append_only`) raises on any UPDATE or DELETE for every role. An entry is the rows sharing an
  `entry_id`; an edit is a new row, and the entry reads as its newest. `app/JournalBox.tsx` lists today's entries only,
  each with its versions behind "n versions". **There is no way yet to read an earlier day's entries**: a known v1 gap.
  * An unsent draft is kept per day in `localStorage` (`grid.draft.<day>`) until Save hands it to the outbox.
    Edit is disabled while the page holds typed words, so it cannot overwrite them.
  * "Give me a prompt" picks from `lib/prompts.ts` (a fixed list in the code) and shows it above the page, never in it.
- **Meditation** (`app/Meditation.tsx`): 1, 3, 5, 10, 15 or 20 minutes, a full-screen sitting with a circle that grows
  for 4 seconds and shrinks for 6, the time left, the screen held on (`lib/wakelock.ts`) and a three-strike chime at
  the end (`lib/chime.ts`, Web Audio, no file). Time left comes from timestamps, not ticks. A sitting ended early
  is logged with `finished` false and how long it ran; only finished sittings count to the streak
  (`streakFrom` in `lib/days.ts`: consecutive days ending today, or yesterday if today has none yet).
  * **Reduced motion is decided in `app/globals.css` alone:** the circle's animation and the hiding of the text
    count (`.grid-count`) are both written only under `prefers-reduced-motion: no-preference`. A test reads the CSS.
  * **The streak reads at most 1000 finished-session rows from the last 400 days** (PostgREST's `max_rows`).
  * **Phone-only, not proven by any test (RULES.md, Settled):** the wake lock, the chime (a phone only lets a page
    make sound from a tap, so the context is made on Begin), the circle's look, and 44px targets. The owner's phone check closes it.
- **Goals and lists** (`/more`, `app/More.tsx`): goals (add, tick), lists with items (add, tick), and the routines list
  (add, retire). There is no delete or rename of a goal, list or item.
- **API:** `GET /api/today`, `GET /api/more`, and `POST` on `/api/tasks`, `/api/routines`, `/api/journal`,
  `/api/meditation`, `/api/goals`, `/api/lists`, each `{op, ...}` parsed by `lib/validate.ts`. A refusal's message never repeats
  what was typed, and **nothing logs**: a body can be a journal entry (a test greps `app/` and `lib/` for `console.`).
  A database error is reduced to its code (`DbError`) because its message can quote the row.
- **`/api/health`** is signed in only (behind the gate) and reads one `grid.tasks` id: it fails as a permissions error
  when `grid` is missing from the dashboard's exposed-schemas list, which is the step that gets missed.
- **Database:** schema `grid`, the tables (`tasks`, `routines`, `routine_ticks`, `journal_versions`,
  `meditation_sessions`, `goals`, `lists`, `list_items`), RLS on and no policies, in two migrations:
  `create_grid_schema` then `grant_grid_schema_usage` (additive). The server uses the service role only;
  `lib/supabase.ts` pins `grid`. `supabase/config.toml` lists `grid`.
- **No model** (Never 3): nothing imports one and there is no `lib/models.ts`; a test checks.
- **The household calendar** (#66, epic #65; contract in RULES.md, "Calendar contract"). Grid hosts the one Outlook
  connection for every app. It is **not Grid's data** and is built to move: schema `calendar` (migrations
  `create_calendar_schema` then `grant_calendar_schema_usage`), its own client (`lib/calendar/store.ts`, pinned to
  `calendar`), and the stamped `lib/calendar-client.ts` (`packages/shared`), which holds the one address apps send to.
  * **Code** (`lib/calendar/`): `validate.ts` (the contract's body), `graph.ts` (mapping to Graph and the few calls, all
    with an injected `fetch`), `flush.ts` (the outbox push), `store.ts` (the `Store` interface and its Supabase
    implementation), `expiry.ts` (the secret's date). **Routes** (`app/api/calendar/`): `events` (POST: append, then
    flush), `connect` and `callback` (the one-time Microsoft sign-in), `status` (GET, for `/more`), `flush` (POST, "Send
    now"). `app/CalendarStatus.tsx` is the block on `/more`.
  * **Tables:** `connection` (one row: the refresh token and the flush lock), `calendars` (app to Graph calendar id),
    `outbox` (append-only; a flush stamps only `sent_at` and `error`), `events` ((app, source_id) to Graph event id).
    `calendars` is an addition to the issue's three, so a calendar is made once and never found by name.
  * **The flush** takes a lock on the connection row (Microsoft replaces the refresh token on every use, so two at once
    would break the connection), refreshes once and saves the new token before anything else, then sends the newest
    unsent row per (app, source_id): older ones are stamped sent with the note `superseded`, so a bad row never blocks a
    corrected one. A failure stays unsent with a short `graph <status> <code>` (never Graph's message, which can quote the
    event) and is retried by the next send or "Send now"; a 429 stops the flush. There is no cron: **a row appended while
    another flush holds the lock waits for the next send** (the holder reads again before it ends, so it is rare).
  * **Mapping:** every event is written in Graph's `Mountain Standard Time` (Windows' name for America/Denver, daylight
    saving included) with the contract's wall-clock times unconverted; all-day is midnight to midnight with Graph's end the
    day after the last day; a create carries the outbox row id as `transactionId` so a retry after a crash does not double.
  * **Not proven from here:** nothing has reached Microsoft. Everything above is tested with a fake `fetch`; the first
    real check is the owner's (#69, then a test event). Graph accepting the Windows zone name and `transactionId` on a
    personal account is from its documentation, not an observed call.
  * **The Microsoft client secret expires 2028-11-16** (`SECRET_EXPIRES` in `lib/calendar/expiry.ts`; `/more` warns
    within 30 days, and Outlook stops syncing the day it passes). To renew: make a new secret in the app registration,
    set `MS_CLIENT_SECRET` in `tp-grid`, change `SECRET_EXPIRES` to the new date. The refresh token is unaffected. The redirect
    URI to register is `https://grid.techpaddock.io/api/calendar/callback`.
  * **Moving it** (to its own app, say): copy `lib/calendar/`, `app/api/calendar/`, `app/CalendarStatus.tsx` and the status
    block's mount, give the new app the `calendar` client, `MS_CLIENT_ID`/`MS_CLIENT_SECRET` and a registered redirect
    URI, then change `CALENDAR_BASE_URL` in `packages/shared/lib/calendar-client.ts` and stamp. No schema move and no
    caller changes. The old routes go last. The Microsoft token is stored in `calendar.connection` as plain text behind
    RLS, the same trust as the service key; it carries across with the schema.
  * Grid's own routines reaching the calendar is #68 and Lando's is #67; neither is here.

## Traps

- **The gate file, `tests/gate.test.ts` and the stamped files are copies.** Never edit them here
  (`node scripts/stamp-shared.mjs`); `proxy.ts` is byte-for-byte the other apps'.
- **`next-env.d.ts` is generated by `next build`/`next dev`,** so `tsc` alone fails on the `.png` imports in a fresh clone until a build has run.
- **The vitest include is `tests/**/*.test.ts`:** a component test is a `.ts` file using `createElement`, not JSX (as Lando's).
- **A route file may export only HTTP methods and route config:** the health probes are a plain `const`, not exported (Next fails the build otherwise).
- **Days are strings.** Never build one with `new Date().toISOString()` (UTC); use `localDay()` in the browser.
- **The calendar tests run on an in-memory `Store` and a scripted Graph** (`tests/memoryStore.ts`), because Microsoft cannot be reached from CI. The Supabase side of `lib/calendar/store.ts` is covered only by the call-shape tests in `tests/calendar-store.test.ts`.
