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
4. Read or write another tool's schema. `lib/supabase.ts` pins `grid`.
5. Lose a tap. A failed save stays on screen with a retry; it never shows as saved.

## Settled

- Schema `grid`, RLS on, no policies; the server reads and writes it through the service role only (approved 2026-11-16, #47).
- The meditation timer's screen-on and chime are phone-only behaviour: it is not done until it passes a check on a phone (an owner task).
- Phone reminders are a later issue, not v1 (#50).
