# TechPad Gen — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is live

**The Pit Wall** — `/`, the hub landing, answering "what needs me, right now, with several agents
out". It renders the ledger's `Waiting on Joel` and `Parked` sections plus one row per agent, baked
at build time by `scripts/collect-paddock.mjs` because files above `apps/home` are not readable at
runtime. Its spec is retired: the thing is built, so the spec stopped being read.

**The Garage** — `/admin`. Three panels. *Declared* is generated at `prebuild` from `.env.example`
names, the CI matrix and `supabase/migrations`. *Reported* is probed live. *Rules drift* runs the
TD's `scripts/drift-check.mjs --json` at `prebuild` and renders every check it measured, passing
ones named rather than dropped. **None of it guesses** — anything unreachable reads "unknown" or
warns, with the reason. **It is also not a page anything is typed into** — that was the central
decision and it should survive whatever gets built next, because a page agents write config into is
a second source of truth, and this project has been injured twice by exactly that.

**The theme system** — ten palettes, five liveries, both polarities, the light/dark control in every
header. `lib/theme.css` holds every token and is byte-identical in every app; `lib/livery.ts` is the
one file that differs per app. No `tailwind.config.ts` contains a colour any more — every entry
reads `rgb(var(--token-rgb) / <alpha-value>)`, and the triplet form is required rather than
preferred: it is the only shape Tailwind's alpha modifier can interpolate.

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
- **The glance gets counts and singles, never rows.** A hub handed thread arrays slowly becomes a
  worse copy of the tracker. `SOURCES` holds one entry today — a fact about the present, not a
  design limit.
- **One Garage panel is not live, and it is the one that looks most authoritative.** Rules drift is
  the repo as it stood when *this deployment* was built, so it goes stale after any merge until
  `tp-home` redeploys. The panel says so on its face; keep that if it is ever rewritten.
- **The drift JSON shape is the TD's, not this app's** — `{checks:[{name,state,detail}], counts}`.
  `collect-drift.mjs` will not render a partial read: anything it cannot parse becomes
  `complete: false` with the reason printed, never a panel quietly missing a row.

## In flight

`claude/home-morning-paper-prototype` — the Morning Paper, open as #82. **Design approved by Joel on
2026-09-16**, and he lifted the privacy fold with it: *"drop above the fold below, ill manage
privacy."* So what is owed leads, job search included, and the layout enforces no privacy boundary.
**That amends a settled decision in `DECISIONS.md` and wants recording there.** The Feed is still
undefined and renders as a labelled slot; its open questions are with Joel.

## Next

1. **The Morning Paper**, the ledger's other request to this agent. A prototype exists on the branch
   above and as an artifact Joel can open, and it is **not approved**. Do not widen it: the lead above
   the fold and the Feed are both unanswered, and Joel holds the brief.
2. **The hub's mobile login bug.** Both cheap explanations are ruled out from the code: `APPS`
   hardcodes the custom domains, and the cookie attributes are sound. It needs a live repro with
   devtools. **Reproduce in Chrome** — the WebKit cookie-policy theory is ruled out and cost a round.
3. **`apps/home` still has no `test` script.** CI runs `npm run test --if-present`, so adding one
   opts the app in with no CI change. `lib/glance.ts`, `lib/diagnostics.ts` and `lib/pitwall.ts` are
   pure and untested.
4. **A style pass, deferred by Joel** — a monospace stack, a type scale to replace the ad-hoc pixel
   values, and collapsing the drifted copies of the micro-label rule. Pick it up when he returns.
5. **`/api/version` is designed and undecided** — public, or behind the internal secret. The
   recommendation is public: it exposes a commit hash of a private repo and nothing else, and that
   is what lets an external monitor notice an outage. Joel's call.

The hairline contrast bar is still his: `--line` on `--surface` is under the 3:1 bar for a non-text
component, and raising it changes every app's look. **Polarity is now answered** — one site-wide
toggle, kept in every header, and density does not carry it — but the ledger still reads that as
open, so it is the TD's to record and clear.
