# Home — notes

## What is live

- Next.js 16, React 19, `proxy.ts` (the base copy, function renamed). Every server `fetch` is
  `no-store` in a `force-dynamic` page.
- Tabs: the Pit Wall at `/` (id `board`) and The Garage at `/?tab=garage`; `/admin` redirects
  there. Each loads in its own Suspense boundary; `?app=` renders a tool's frame and loads neither.
- Pit Wall: open Linear issues, team TEC (`lib/linear.ts`). *By status* puts assigned, unparked
  issues in a *Waiting on you* band, then In Progress, In Review, Todo, with the rest folded. *By
  app* follows the roster, Platform last (`lib/pitgroups.ts`); `?group=app` keeps it.
- The Garage: one stoplight row per item — green, amber (could not test), red, grey (parked). Each
  failure is a sentence plus its raw code (`lib/diagnostics.ts`). Rules drift is baked at build
  (`lib/drift-explain.ts`).
- Bar controls, all stamped: `LiveryBadge` on every bar, framed or not; `ThemeControl` and
  `LogoutControl` hidden in a frame.
- `PARKED` is empty. A parked app would be probed and shown grey.
- Liveries in `packages/shared/lib/theme.*`: `martini`, `clark`, `senna`, `mp44`, `jps`, `mcl39`
  (McLaren '25, MCL39, papaya and anthracite; TEC-120). `mcl39` is worn by no app until Lando
  switches to it.

## Traps

- `lib/*.generated.ts` are gitignored, written by `predev`/`prebuild`/`pretest`. `npx tsc --noEmit`
  fails on a fresh checkout until one has run.
- `scripts/gate-file.test.mjs` builds its base-copy fixture from home's `proxy.ts`.
- `vercel.json`'s `ignoreCommand` always builds production, which keeps Rules drift current. Do not
  narrow it: a `.claude`-only change must rebuild home.
- The Linear query asks for `assignee { id }` only; user records carry a real name and email. The
  owner is the only assignee, so "assigned" is enough.
- `nextStep` treats "done", "skipped", ✅ or a strikethrough as finished; any other format shows as
  open.
- GitHub sees only git-triggered deploys, so a dashboard rollback is invisible to Deploy errors.
  `GITHUB_TOKEN` needs *Deployments: read*.
- A function exported from a `"use client"` file cannot run on the server; hence `app/apps.ts` and
  `lib/pitgroups.ts`.
- A long tab scrolls only because `.content` sets `overflow-y` and `min-height: 0`.
- A framed tool hides its Light/Dark control and follows home's `{type:"paddock-mode"}` message,
  checked by `isPaddockOrigin()`. A tool without `ThemeControl.tsx` ignores home's switch.
- `LogoutControl` goes to `/login` only on a 2xx or 401.
- No `tailwind.config.ts` holds a colour; alpha works only as `rgb(var(--token-rgb) / <alpha-value>)`.
- `PROBED` is the live projects plus `PARKED`. Never key anything off a slug literal.
- Drift's JSON shape is the TD's. A renamed check family loses its sentence until the check emits
  `explain`.
- "Hub" remains in stamped comments and `proxy.ts` (TEC-85).
- `theme.css` says it is generated from "the palette set the contrast gate checks". No such gate
  or palette source is in the repo; a new livery is hand-written and measured by hand. Hold each
  token pair at or above the lowest any existing livery holds for that pair.
- A livery's bar must be dark. The shared header CSS paints bar ink at 0.72 and 0.4 alpha and the
  failed-logout border in `--sev-urgent`; on a bright bar (papaya was tried) those fall under
  4.5:1 and 3:1. A bright bar needs those shared rules changed first.
