# Grid — notes

## State

v1, the daily page (#43, TEC-275), on Next.js 16, copied from `apps/lando`. Not yet live: it waits on the
two migrations and the owner's outside steps (a Vercel project `tp-grid`, env vars, DNS, the login rate
limit, the `grid` exposed schema, a `FORCE_BUILD` rebuild). Not in `TOOLS` in `apps/home/lib/platform.ts` yet,
so The Garage and Smoke do not probe it; that is a separate home change.

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

## Traps

- **The gate file, `tests/gate.test.ts` and the stamped files are copies.** Never edit them here
  (`node scripts/stamp-shared.mjs`); `proxy.ts` is byte-for-byte the other apps'.
- **`next-env.d.ts` is generated by `next build`/`next dev`,** so `tsc` alone fails on the `.png` imports in a fresh clone until a build has run.
- **The vitest include is `tests/**/*.test.ts`:** a component test is a `.ts` file using `createElement`, not JSX (as Lando's).
- **A route file may export only HTTP methods and route config:** the health probes are a plain `const`, not exported (Next fails the build otherwise).
- **Days are strings.** Never build one with `new Date().toISOString()` (UTC); use `localDay()` in the browser.
