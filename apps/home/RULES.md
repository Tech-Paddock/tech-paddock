# Home — rules

`apps/home` is the hub at `techpaddock.io`, the theme for every app, and the rules for the parked
`apps/tracker`. State and traps are in `NOTES.md`.

## The hub

- It opens on what needs attention, not a list of links, and embeds the tools in iframes.
- It is neither site nor app, and there is one. A tool that seems to need a hub is a site whose
  index does too much.
- The Garage is a tab beside the Pit Wall; `/admin` redirects to it.
- It holds no database credential: no Supabase dependency, no schema read. Its keys are
  `LINEAR_API_KEY` (the Pit Wall) and `GITHUB_TOKEN` (deployment state).
- It does not read `INTERNAL_API_SECRET`. `VERCEL_TOKEN` is retired; The Garage warns while it is set.
- It knows tools only through `TOOLS` in `lib/platform.ts`. The array order is the sidebar order;
  changing it is the owner's call.
- If it ever reads a tool's summary again: counts and singles, never rows. A hub fed rows becomes a
  worse copy of the tool.
- `lib/deploys.ts` reads production deployments from the statuses Vercel posts to GitHub. The
  deployment-state traps in `.claude/skills/merge/SKILL.md` apply to what The Garage shows.
- Work in another app's folder is named in the pull request.
- Run `npm run build` and `npx tsc --noEmit` before pushing.

## Iframes and the session

- Home's `next.config.mjs` is stamped, so it sends the same `frame-ancestors` as every app.
- Home's `/api/logout` clears the `.techpaddock.io` cookie, which signs out every subdomain at once.

## The theme

- The theme covers every app: palette, tokens, type, spacing and the shared component language.
- Any app may use what exists, and may copy a pattern locally if its pull request says so. Changing
  or forking the system happens here.
- In scope: `app/globals.css`, `tailwind.config.ts`, the `<html>` attributes in `layout.tsx`,
  colour-bearing utility classes, `lib/livery.ts`, and `lib/theme.*` and `app/ThemeControl.tsx`.
- `lib/theme.*` and `app/ThemeControl.tsx` are edited in `packages/shared`, then
  `node scripts/stamp-shared.mjs`. Never edit a stamped copy.
- Out of scope: the gate file, the stamped auth files, `lib/supabase.ts` and every API route.
- One livery per app, fixed at build time, in both polarities, with a toggle in every header. Only
  polarity is shared, through the `paddock_mode` cookie. A hub in one livery framing a tool in
  another is intended.
- A change to every app's look says so in its pull request.
- Fix the convention, not the instance.
- Making every tool installable needs the shared auth plumbing: a web app manifest is fetched
  without credentials, so each app's gate file must allow it.

## The tracker

- Parked: do not build on it or delete it. Unparking is the owner's call.
- It keeps its name, `tracker.techpaddock.io`, the `tracker` schema, and its `middleware.ts`
  variant on Next 14.
- `apps/editor` is the TD's, not home's.
- Its schema is described by its migrations in `supabase/`. The cross-schema contracts are written
  in `supabase/README.md`; below is the tracker's side of each.

### Draft follow-up

- A thread's button calls the editor's `/api/draft` server to server, with the linked contact and
  the thread's notes, authenticated by an `INTERNAL_API_SECRET` header.
- The editor's gate file exempts `/api/draft` only, as an exact path. Widening it is the TD's
  decision.

### `shared.contacts`

- The tracker reads contacts and stores `contact_id` on its threads. It never writes the table.
- Writing it changes the contract, which goes through the TD to the owner.

### `/api/summary`

- Nothing reads it. Its carve-out stays as built: exact `pathname === "/api/summary"`, read-only,
  failing closed without the secret.
- Counts and singles, never rows. Lists stay behind `loadDashboard`.

### Resume write-through

- Naming a company when saving a render in the Resume Formatter creates or updates a thread.
- The tracker keeps its own thread creation for threads with no resume.
- Company, role, posting URL and contact live on the thread, never in `resume.renders`.

### Cross-schema reads

- `loadDashboard` reads `editor.message_history`, `resume.renders` and `resume.templates`,
  read-only, to derive last touch.
- A renamed column in either tool degrades to a note, not an error, so it fails silently.

### Cron and Microsoft Graph

- `/api/cron/stale-tasks` checks `CRON_SECRET` twice: the gate file admits `/api/cron/*` only with
  the bearer, and the route returns 401 when the secret is unset or wrong.
- `CRON_SECRET` must be set or the sweep never runs (TEC-14).
- Microsoft Graph is built and inert: `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` and
  `MS_GRAPH_REFRESH_TOKEN` are unset, so the calendar, To Do and the sweep degrade with no signal.
