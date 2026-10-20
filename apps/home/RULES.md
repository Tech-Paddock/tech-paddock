# Home — rules

`apps/home` is the hub at `techpaddock.io` and the theme for every app. State and traps are in
`NOTES.md`.

## The hub

- It opens on what needs attention, not a list of links, and embeds the tools in iframes.
- It is neither site nor app, and there is one. A tool that seems to need a hub is a site whose
  index does too much.
- The Garage is a tab beside the Pit Wall; `/admin` redirects to it.
- It holds no database credential: no Supabase dependency, no schema read. Its keys are
  `LINEAR_API_KEY` (the Pit Wall) and `GITHUB_TOKEN` (deployment state).
- `VERCEL_TOKEN` and `INTERNAL_API_SECRET` are not read; The Garage warns while either is set.
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
