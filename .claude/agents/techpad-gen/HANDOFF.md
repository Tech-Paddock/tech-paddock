# TechPad Gen — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is live

**The Pit Wall** — answering "what needs me, right now, with several agents out". It renders the
ledger's `Waiting on Joel` and `Parked` sections plus one row per agent, baked at build time by
`scripts/collect-paddock.mjs` because files above `apps/home` are not readable at runtime.

**The Garage** — `/admin`. Three panels: *Declared*, generated at `prebuild` from `.env.example`
names, the CI matrix and `supabase/migrations`; *Reported*, probed live; *Rules drift*, the TD's
`scripts/drift-check.mjs --json`, passing checks named rather than dropped. **None of it guesses** —
anything unreachable reads "unknown" with the reason. **Nothing is ever typed into it**: a page
agents write config into is a second source of truth, which has injured this project twice.

**The theme system** — ten palettes, five liveries, both polarities, the light/dark control in every
header that is not framed (below). `lib/theme.css` holds every token and is byte-identical in every
app; `lib/livery.ts` is the one file that differs per app. No `tailwind.config.ts` contains a colour
any more — every entry reads `rgb(var(--token-rgb) / <alpha-value>)`, and the triplet form is
required rather than preferred: it is the only shape Tailwind's alpha modifier can interpolate.

**The Morning Paper** — `/` lands on Paper, Board and Feed alongside, held 24px clear of the sidebar
by `.tabbed`. No privacy fold: Joel lifted it. The Feed is undefined and renders a labelled slot.

**The chrome is a layout, not a component.** `app/(shell)/` is a route group holding `/` and
`/admin`; its `layout.tsx` renders `Chrome.tsx` with each page as `children`. `/login` is
deliberately outside it — a sidebar there offers links the visitor cannot follow.

## Traps specific to this app

- **Before adding a route to the shell:** it was built around an iframe at `height: 100%`, so
  nothing had ever needed to scroll and there was no `overflow-y` anywhere. A document-length page
  escapes into *document* scroll, dragging the topbar off the top. `.content` now has
  `min-height: 0` and `overflow-y: auto`. Measured, not eyeballed.
- **`children` rather than props is what makes the shell possible.** `/admin` is an async server
  component running live probes, so it can never be rendered *by* a client component — only through one.
- **One switch per page is two halves that must stay together.** Framed, a tool hides its own
  Light/Dark (`[data-embedded] .pd-modes`) and keeps its badge — safe only because the hub posts
  `{type:"paddock-mode", mode}` into every frame and `ThemeControl` listens behind
  `isPaddockOrigin()`. **A tool that drops `ThemeControl.tsx` silently ignores the hub's switch.**
- **The sidebar is the only list of tools; the `--tone-*` ramp is now unused here.** The Board's
  tool tiles duplicated it and Joel removed them. The ramp's tokens still sit in the five-way
  `lib/theme.css`, so retiring them is a theme call rather than a hub one.
- **The glance gets counts and singles, never rows** — a hub handed thread arrays slowly becomes a
  worse copy of the tracker. `SOURCES` holds one entry: a fact about the present, not a design limit.
- **One Garage panel is not live, and it is the one that looks most authoritative.** Rules drift is
  the repo as it stood when *this deployment* was built, so it goes stale after any merge until
  `tp-home` redeploys. The panel says so on its face; keep that if it is ever rewritten.
- **The drift JSON shape is the TD's, not this app's** — `{checks:[{name,state,detail}], counts}`.
  `collect-drift.mjs` will not render a partial read: anything it cannot parse becomes
  `complete: false` with the reason printed, never a panel quietly missing a row.

## In flight

`claude/home-remove-app-tiles` — the Board's tool tiles deleted, with the `tone` plumbing and tile
CSS they were the only user of. Pushed, no pull request yet.

## Next

1. **The hub's mobile login bug.** Both cheap explanations are ruled out from the code. Needs a
   live repro with devtools, **in Chrome** — the WebKit theory is ruled out and cost a round.
2. **The Feed is undefined and deliberately unbuilt.** It is in the settled tab order and nowhere
   else. The open questions are with Joel; the sharpest is that a feed is rows and this app's rule
   is counts and singles, never rows. **Do not invent one.**
3. **`apps/home` still has no `test` script.** CI runs `npm run test --if-present`, so adding one
   opts it in with no CI change. `glance.ts`, `diagnostics.ts`, `pitwall.ts` are pure and untested.
4. **A style pass, deferred by Joel** — a monospace stack, a type scale to replace the ad-hoc pixel
   values, and collapsing the drifted copies of the micro-label rule. Pick it up when he returns.
5. **`/api/version` is designed and undecided** — public, or behind the internal secret. Recommend
   public: it exposes a commit hash and nothing else, which is what lets a monitor see an outage.

Both decisions Joel settled on 2026-09-16 are recorded in `DECISIONS.md` by #89 — the lifted fold
and polarity against the Paper. Read them there; a second copy here could only drift.
