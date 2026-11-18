# Grid — rules

One person's daily page: today's tasks, routines, a journal, a meditation timer, and goals and lists one step out.

## Scope

- Tasks (title, optional due date, done), routines (a named checklist with the weekdays it repeats, and one tick per day), journal entries, meditation sessions (length, finished or not), goals, and lists.
- One shared password, as every app. The other household member has it too, so the journal is not private from them (owner's choice, 2026-11-12).

## Surface: app

- One screen, Today, opening on the current day: today's tasks, today's routines to tick, the journal box, and the meditation timer with its streak. Goals and lists sit behind one quiet secondary link, the same nouns one step out.
- Thumb-first, phone in hand, many times a day. Installable through `/app.webmanifest`.
- Journal: a blank page, with a small "Give me a prompt" link that shows one prompt from a fixed list in the code.
- Meditation: choose a length, breathe with a slow expanding circle, and hear a chime at the end. Under reduced motion the circle stays still and a text count shows instead. The screen stays on while it runs. Each session is logged, and Today shows the streak.

## Never

1. Rewrite a journal entry. An edit is a new version; history is kept. Append, don't rewrite.
2. Log, test or seed real journal text, or put real names in the repo. Fixtures are invented.
3. Call a model in v1. A reflection or summary feature is its own issue, through a new `lib/models.ts` (CLAUDE.md's model and effort) with its own test.
4. Read or write another tool's schema. `lib/supabase.ts` pins `grid`. The one other schema Grid touches is `calendar` (below), through its own client, `lib/calendar/store.ts`; no `grid` table is read or written from it.
5. Lose a tap. A failed save stays on screen with a retry; it never shows as saved.

## Settled

- Schema `grid`, RLS on, no policies; the server reads and writes it through the service role only (approved 2026-11-16, #47).
- The meditation timer's screen-on and chime are phone-only behaviour: it is not done until it passes a check on a phone (an owner task).
- Phone reminders are a later issue, not v1 (#50).

## Calendar contract

Grid hosts the one connection to the household's shared Outlook account (its address is in paddock-issues #65, not here) for every app, for now (owner, 2026-11-17, #65, #66). Apps send events; Grid keeps them in the `calendar` schema and pushes them to Microsoft Graph, one Outlook calendar per app. It is built to move: the schema is its own, and the only address apps hold is in the stamped `lib/calendar-client.ts`.

- **Grid is also a caller** (#68, TD-approved): its routines and dated tasks go to the "Grid" calendar (`app: "grid"`, `source_id` the row's id) through the same stamped `sendCalendarEvent` as every other app, never the calendar module directly, so a move of the route needs no change here. A routine is an all-day weekly event on its weekdays, deleted when retired; a task with a due date is an all-day event, deleted when ticked done or undated. The send comes from the server route after the write succeeds, and a calendar failure never fails a save.
- **Route:** `POST /api/calendar/events`, behind the gate like everything else. Callers forward only `paddock_session` (as Health calls Cookbook), through `sendCalendarEvent` in `lib/calendar-client.ts`, which never throws. No app reads the `calendar` schema or talks to Microsoft.
- **Body:** `{app, source_id, op: "upsert", title, start, end?, all_day?, recurrence?, notes?}` or `{app, source_id, op: "delete"}`.
  * `app`: the caller's slug (`lando`, `grid`, `pit-row`): lowercase letters, digits, hyphens. It names the calendar ("Lando", "Pit Row"), made on first use.
  * `source_id`: the caller's own id for the thing. One id is one event: sending it again updates that event; `delete` removes it.
  * Times are **Denver wall-clock**, never UTC and never with an offset or `Z`: `"YYYY-MM-DDTHH:mm"` for a timed event (`end` defaults to an hour later), `"YYYY-MM-DD"` with `all_day: true` for an all-day one, where `end` is the **last day, inclusive** (defaults to `start`).
  * `recurrence`: `{freq: daily|weekly|monthly|yearly, interval?, days_of_week?, until?}`. Interval is 1 by default; `days_of_week` ("monday" to "sunday") is weekly only and defaults to the start's weekday; `until` is the last day, inclusive, and a repeat without it goes on forever. Monthly and yearly repeat on the start's day.
  * `title` is up to 200 characters and `notes` up to 4000. **Titles stay plain**: anyone a calendar is shared with sees everything in it.
- **Answers:** `200 {ok: true, unsent}` once the event is in the outbox, whether or not Outlook took it (`unsent` is how many rows still wait; null if the push itself failed). `400` for a body the contract refuses, naming the field and never repeating it. `500` when the outbox could not take it: only then was the event not accepted, and the caller treats it as not saved.
- **One way:** the caller stays the source of truth. An edit made in Outlook is not read back and is overwritten by the next send of that `source_id`.
- **The outbox is append-only** (a trigger on `calendar.outbox` refuses a delete and any change but `sent_at` and `error`). A failed push stays unsent and is retried by every later send and by "Send now" on `/more`; several unsent rows for one `source_id` collapse to the newest.
- **Grid's `/more` shows** whether Outlook is connected, how many events wait, the last error, and a warning within 30 days of the Microsoft client secret's expiry (`lib/calendar/expiry.ts`).
- **Settled:** schema `calendar`, RLS on, no policies, the service role only; Microsoft app-registration keys `MS_CLIENT_ID` and `MS_CLIENT_SECRET` in `tp-grid`; personal-account (`consumers`) sign-in with `Calendars.ReadWrite offline_access` (approved 2026-11-17).
