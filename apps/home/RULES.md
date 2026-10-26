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
- It knows tools through `TOOLS` in `lib/platform.ts`, whose array order is the sidebar order;
  changing that order is the owner's call. Adding a tool also touches `PRESENTATION` in
  `app/apps.ts` (typed by `ToolSlug`, so the build fails until the tool has an icon), `ROSTER` in
  `lib/pitgroups.ts` (the Pit Wall's app order, hand-typed until TEC-163) and the slug list in
  `scripts/smoke-check.test.mjs`.
- `scripts/smoke-check.mjs` reads `lib/platform.ts` with a regex: each entry is one object literal
  holding only `slug`, `name`, `url` and `vercelProject`, in that order, and the live lists sit
  above `PARKED`. It skips an entry in any other shape without saying so.
- Never key anything off a slug literal; derive it from `TOOLS`, `PROBED` or a route flag. A typed
  slug broke `diagnostics.ts` when its tool was dropped.
- If it ever reads a tool's summary again: counts and singles, never rows. A hub fed rows becomes a
  worse copy of the tool.
- `lib/deploys.ts` reads production deployments from the statuses Vercel posts to GitHub, never
  Vercel's API. Of the deployment traps in `.claude/skills/merge/SKILL.md`, only "env vars bake in
  at build time" applies: The Garage's environment errors are as this deployment was built.
- Work in another app's folder is named in the pull request.
- Run `npm run build` and `npx tsc --noEmit` before pushing.

## Iframes and the session

- Home's `next.config.mjs` is stamped, so it sends the same `frame-ancestors` as every app.
- Home's `/api/logout` clears the `.techpaddock.io` cookie, which signs out every subdomain at once.

## Security

What home's own code enforces. The shared auth plumbing and its rules are in `CLAUDE.md`.

- **Framing:** `?app=` is a slug lookup, so a frame's `src` is only ever a `TOOLS` URL. The iframe
  grants only `clipboard-write` (`app/apps.ts`, `app/(shell)/page.tsx`, `app/Landing.tsx`).
- **Signed-out paths:** the gate (`proxy.ts`, shared plumbing) lets through only `/login`,
  `/api/login`, `/_next/`, the icons in `PUBLIC_ICONS` and the cron path, which needs the
  `CRON_SECRET` bearer. `from` is followed only through `safeRedirectTarget`: a path on this
  origin, else `/`.
- **Headers:** the shared set (`packages/shared/next.config.mjs`) is CSP `frame-ancestors`,
  `nosniff` and `Referrer-Policy`.
- **The Garage** reports whether a variable is set, never its value (`lib/diagnostics.ts`).
- **The Pit Wall** never writes to Linear, and reads only an issue's assignee id, never a Linear
  user record (`lib/linear.ts`).

## The theme

- The theme covers every app: palette, tokens, type, spacing and the shared component language.
- Any app may use what exists, and may copy a pattern locally if its pull request says so. Changing
  or forking the system happens here.
- In scope: `app/globals.css`, the `<html>` attributes in `layout.tsx`, colour-bearing utility
  classes, `lib/livery.ts`, `lib/theme.*`, `app/ThemeControl.tsx`, `app/LogoutControl.tsx`, and each
  tool's `tailwind.config.ts` (home has no Tailwind).
- `lib/theme.*`, `app/ThemeControl.tsx` and `app/LogoutControl.tsx` are edited in `packages/shared`,
  then `node scripts/stamp-shared.mjs`. Never edit a stamped copy.
- Out of scope: the gate file, the stamped auth files, `lib/supabase.ts` and every API route.
- One livery per app, fixed at build time, in both polarities, with a toggle in every header. Only
  polarity is shared, through the `paddock_mode` cookie. A hub in one livery framing a tool in
  another is intended.
- A livery's bar must be dark. The shared header CSS paints bar ink at 0.72 and 0.4 alpha and the
  failed-logout border in `--sev-urgent`; on a bright bar (papaya was tried) those fall under 4.5:1
  and 3:1. A bright bar needs those shared rules changed first.
- Each token pair holds contrast at or above the lowest any existing livery has for that pair,
  measured by hand: nothing in the repo checks it.
- No `tailwind.config.ts` holds a colour. A colour compiled in at build time is one no livery or
  polarity can reach.
- A change to every app's look says so in its pull request.
- Fix the convention, not the instance.
- Making every tool installable needs the shared auth plumbing: a web app manifest is fetched
  without credentials, so each app's gate file must allow it.
