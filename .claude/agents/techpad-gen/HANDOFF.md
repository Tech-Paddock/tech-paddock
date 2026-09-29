# TechPad Gen — handoff

State as of 2026-09-26.

Read `RULES.md` first. Open work is in Linear, label `agent:TechPad Gen` — never here.

---

## What is live

**The Morning Paper** at `/`, and **Pit Wall** (id `board`, so `/?tab=board` lives): each loads in
its own Suspense boundary; `?app=` renders the frame and loads nothing. No privacy fold (Joel).

**The glance says why it has no answer.** `fetchSummary` returns `{ok:false, why}` (secret unset,
401, HTTP code, timeout, unreachable, wrong shape); with no source answering every count renders "—"
with the reason, never 0, and `isQuiet` is false. `SOURCES` is the tracker alone, and it **does not
answer in production**: `INTERNAL_API_SECRET` is unset on `tp-home` (TEC-8, blocked on TEC-33).

**The Pit Wall reads only GitHub** — never `VERCEL_TOKEN`. Open pull requests; branches with none (a
squash-merged branch is recognised by its merged PR's head sha — `ahead_by` counts it ahead forever);
each probed project's **latest** production deployment from Vercel's `Production – <project>`
statuses. Rows carry the owner from `claude/<area>-` (`AREA_OWNER`); handoff dates are baked.

**The Garage** — `/admin`. Live: probes over `PROBED`, the hub's environment, and a warning while the
retired `VERCEL_TOKEN` is set. Baked at build: *Declared* and *Rules drift*. Unreachable reads
"unknown", with the reason — **none of it guesses**.

**The theme system** — palettes, liveries, both polarities, and **three stamped controls per bar**:
`LiveryBadge` hard right on every bar including a framed tool's; `ThemeControl` and `LogoutControl`
beside the brand, both hidden in a frame (below). `lib/theme.css` holds every token; `lib/livery.ts`
differs per app. No `tailwind.config.ts` holds a colour: `rgb(var(--token-rgb) / <alpha-value>)` is
all alpha can read.

**Log out is everywhere at once** (TEC-73). Every app's `/api/logout` re-exports the stamped
`lib/logout.ts`, which clears the `.techpaddock.io` session cookie at max-age 0 (pinned by
`tests/logout.test.ts`). The control is on every live app's bar, the hub's topbar included — its
sidebar button is gone. Tracker and editor carry the route, inert while paused, and mount no control.

**The tracker is parked** (Joel, 2026-09-24; state on TEC-36). Still in `PARKED`, so probed, and a
red deploy of it shows as expected, not BOX.

## Traps specific to this app

- **`lib/*.generated.ts` are gitignored, written by `predev`/`prebuild`/`pretest`** from files above
  `apps/home` (build time only). A bare `npx tsc --noEmit` on a fresh checkout fails until one runs.
- **`vercel.json`'s `ignoreCommand` skips previews and always builds production** — the hub diffs
  nothing since #191, so every production merge rebuilds it, which is what keeps its baked panels
  and agent rows current. **Do not narrow it**: `.claude` changes alone must still rebuild the hub.
- **GitHub sees only git-triggered deploys.** A dashboard rollback or redeploy posts nothing, so the
  Pit Wall can show an older state than is serving (TEC-57).
- **`GITHUB_TOKEN` must read deployments.** The repository is public, but a fine-grained token scoped
  without *Deployments: read* may be refused; the Pit Wall then names the 403 per project.
- **A function exported from a `"use client"` file cannot be called on the server** — that is why
  `APPS` lives in `app/apps.ts`, `DENSITIES` in `Landing.tsx` and the filter in `lib/pitfilter.ts`.
- **The shell was built around an iframe at `height: 100%`**; a document-length route scrolls only
  because `.content` sets `overflow-y` and `min-height: 0`.
- **One switch per page is two halves that must stay together.** Framed, a tool hides its own
  Light/Dark (`[data-embedded] .pd-modes`) and keeps its badge — safe only because the hub posts
  `{type:"paddock-mode", mode}` into every frame and `ThemeControl` listens behind
  `isPaddockOrigin()`. **A tool that drops `ThemeControl.tsx` silently ignores the hub's switch.**
  `LogoutControl` hides framed too (`.pd-logout`), so only the hub's logs out of a hub page.
- **`LogoutControl` goes to `/login` only on a 2xx or a 401** (the middleware's answer without a
  valid session); anything else shows as a failure, never `/login` while still signed in.
- **`TOOLS` in `lib/platform.ts` is the only list of embedded tools, and its order is Joel's** — it
  drives the sidebar and the `?app=` frame. `PROBED` adds what the hub depends on without embedding.
  **Never key anything off a slug literal**; which projects get the secret probe is derived from
  which repo folders have `/api/summary`.
- **Rules drift is the repo as of this deployment**, and says so. Its JSON shape is the TD's;
  `scripts/drift-parse.mjs` renders no partial read.
