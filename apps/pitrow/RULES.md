# Pit Row — rules

A shared household board on an iPad: this week's events from the household Outlook, and the chores due, ticked off by who did them.

## Scope

- Chores: title, cadence (once, daily, weekly on chosen days, or every N days), optional assignee. Each completion is an append-only row with who and when.
- People: names stored in `pitrow.people`, never in the repo. Who did it is a tap on a name.
- Events are not Pit Row's. They live in the household's Outlook calendars, and people add them in Outlook. Pit Row reads the week through Grid's `GET /api/calendar/week`, forwarding only `paddock_session` (Calendar contract, `apps/grid/RULES.md`).
- Each chore is also sent to the "Pit Row" calendar through the stamped `sendCalendarEvent` (`app: "pit-row"`, `source_id` the chore's id), so it shows and reminds on phones. Retiring a chore deletes its event. A calendar failure never fails a save.

## Surface: app

- One screen, This week, opening on today; a day opens in place. iPad first, landscape and portrait, and usable on a phone. Touch targets at least 56px.
- Always on: it refreshes every minute and on focus, never needs a reload, and dims nothing itself. A failed calendar read shows as failed, never as an empty week.
- Installable through `/app.webmanifest`, full screen.
- Browser target: Safari on iPadOS 17 or later, which covers any iPad from the last five years (owner, 2026-11-24). Use nothing newer.

## Never

1. Rewrite or delete a completion. A void is a new row.
2. Put real names in the repo. Fixtures are invented.
3. Call a model.
4. Read or write another tool's schema, `calendar` included. Outlook only through Grid's routes.
5. Lose a tap. A failed save stays on screen with a retry.

## Settled

- Schema `pitrow`: people, chores, completions. RLS on, no policies, server only (approved in #45; the events table was dropped on 2026-11-17).
- One shared password, as every app.
