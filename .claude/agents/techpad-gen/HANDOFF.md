# TechPad Gen — handoff

State as of 2026-09-23.

Read `RULES.md` first. This file is only what is true right now.

---

## What is live

**The Pit Wall** — "what needs me, right now". Live from GitHub and Vercel: open pull requests,
branches with none, failed deployments. Baked by `scripts/collect-paddock.mjs`: one row per agent,
each handoff's title and `State as of` — files above `apps/home` are unreadable at runtime, hence the
first trap below. **It shows no open items**: they are in Linear, and the hub holds no Linear token.

**The Garage** — `/admin`. Three panels: *Declared*, generated at `prebuild` from `.env.example`
names, the CI matrix and `supabase/migrations`; *Reported*, probed live; *Rules drift*, the TD's
`scripts/drift-check.mjs --json`, passing checks named rather than dropped. **None of it guesses** —
unreachable reads "unknown", with the reason. **Nothing is typed into it**; that cost us twice.

**The theme system** — ten palettes, five liveries, both polarities, and **two controls per header,
not one**: `LiveryBadge` hard right on every bar including a framed tool's, and `ThemeControl` — a
sun and a moon, beside the brand — which is the half a frame hides (below). `lib/theme.css` holds
every token, byte-identical everywhere; `lib/livery.ts` is the one file that differs per app. No
`tailwind.config.ts` holds a colour: `rgb(var(--token-rgb) / <alpha-value>)` is all alpha can read.

**The Morning Paper** — `/` lands on Paper, with **Pit Wall the only other tab**, held 24px clear of
the sidebar by `.tabbed`. No privacy fold: Joel lifted it. The Feed was deleted, not parked. **That
tab's id is still `board`** — the label changed, the query string did not, so `/?tab=board` lives.

**The chrome is a layout, not a component.** `app/(shell)/` is a route group holding `/` and
`/admin`; its `layout.tsx` renders `Chrome.tsx` with each page as `children`. `/login` is
deliberately outside it — a sidebar there offers links the visitor cannot follow.

## Traps specific to this app

- **The hub is the only app reading files outside its own folder**, and since #137 an `ignoreCommand`
  skips a merge that missed that folder. Four merges on 2026-09-19 moved `.claude/` alone, which
  would have stranded the Pit Wall's agent rows on hours-old handoffs with nothing red — hence
  `.claude` in this app's pathspec. **Removing it stops a build rather than breaking one.**
- **Before adding a route to the shell:** it was built around an iframe at `height: 100%`, so nothing
  had ever needed to scroll and there was no `overflow-y`. A document-length page escapes into
  *document* scroll, dragging the topbar off the top. `.content` now sets `min-height: 0` too.
- **`children` rather than props is what makes the shell possible.** `/admin` is an async server
  component running live probes, so it can never be rendered *by* a client component — only through one.
- **One switch per page is two halves that must stay together.** Framed, a tool hides its own
  Light/Dark (`[data-embedded] .pd-modes`) and keeps its badge — safe only because the hub posts
  `{type:"paddock-mode", mode}` into every frame and `ThemeControl` listens behind `isPaddockOrigin()`.
  **A tool that drops `ThemeControl.tsx` silently ignores the hub's switch.**
- **`TOOLS` in `lib/platform.ts` is the only list of tools, and its array order is Joel's** — it
  drives the sidebar, the `?app=` frame and The Garage at once. It holds **four**: resume, coffee,
  health, cookbook. **Tracker and editor are both out of it on Joel's word**, so nothing here records
  that `tp-tracker` or `tp-message-editor` exists; putting either back is one entry. **Never key
  anything off a slug literal** — dropping one broke `diagnostics.ts`, derived from a route flag now.
- **The glance gets counts and singles, never rows** — a hub handed thread arrays slowly becomes a
  worse copy of the tracker. `SOURCES` holds one entry, **and it does not answer in production** —
  no request reaches `tp-tracker`, most likely `INTERNAL_API_SECRET` unset on `tp-home` (TEC-8, the
  TD's). **The Garage cannot see it**: its secret probe runs per `TOOLS` entry, and tracker is not one.
- **One Garage panel is not live, and it looks the most authoritative.** Rules drift is the repo as
  of *this deployment*, so a merge that misses this app stales it — the panel says so; keep that.
- **The drift JSON shape is the TD's** — `{checks:[{name,state,detail}], counts}`. `collect-drift.mjs`
  renders no partial read: what it cannot parse becomes `complete: false`, with the reason printed.

## Next

Nothing in flight. **Open items: Linear, team TEC, label `agent:TechPad Gen`.** For TEC-14: the
daily `/api/cron/stale-tasks` answers 401 in production, so the sweep is not running. Also mine:

1. **The hub's mobile login bug.** Both cheap explanations are ruled out from the code. Needs a
   live repro with devtools, **in Chrome** — the WebKit theory is ruled out and cost a round.
2. **`apps/home` still has no `test` script.** CI runs `npm run test --if-present`, so adding one
   opts it in with no CI change. `glance.ts`, `diagnostics.ts`, `pitwall.ts` are pure and untested.
3. **A style pass, deferred by Joel** — a monospace stack, a type scale to replace the ad-hoc pixel
   values, and collapsing the drifted copies of the micro-label rule. Pick it up when he returns.
4. **`/api/version` is designed and undecided** — public, or behind the internal secret. Recommend
   public: it exposes a commit hash and nothing else, which is what lets a monitor see an outage.

Joel's 2026-09-16 calls — the lifted fold, polarity against the Paper — are in `DECISIONS.md` (#89).
