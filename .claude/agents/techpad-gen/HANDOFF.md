# TechPad Gen — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is live

**The Pit Wall** — `/` is the hub landing and answers "what needs me, right now, with several agents
out". It renders the ledger's `Waiting on Joel` and `Parked` sections plus one row per agent, baked
at build time by `scripts/collect-paddock.mjs` because files above `apps/home` are not readable at
runtime. Its spec is retired: the thing is built, so the spec stopped being read.

**The Garage** — `/admin`. What the repo declares against what the platform reports. Declared is
generated at `prebuild` from `.env.example` names, the CI matrix and `supabase/migrations`; reported
is probed live. **It never guesses** — anything unreachable reads "unknown" with the reason.
`CLAUDE.md` now makes this a rule for everyone: any fact that can be computed is computed, never
written in prose. The Garage is where those facts live.

**It is not a page anything is typed into** — the central decision, and worth keeping: a page agents
write config into is a second source of truth, and that has injured this project twice.

**The theme system** — ten palettes, five liveries, both polarities, the light/dark control in every
header. `lib/theme.css` holds every token and is byte-identical in every app; `lib/livery.ts` is
the one file that differs per app and holds a single constant. The tools' `tailwind.config.ts`
no longer contains a colour — every entry reads `rgb(var(--token-rgb) / <alpha-value>)`, and the
triplet form is required, not preferred: it is the only shape Tailwind's alpha modifier can
interpolate.

**The chrome is a layout, not a component.** `app/(shell)/` is a route group holding `/` and
`/admin`; its `layout.tsx` renders `Chrome.tsx` with each page as `children`. `/login` is
deliberately outside it — a sidebar there offers links the visitor cannot follow.

## Traps specific to this app

- **Before adding a third route to the shell:** the shell was built around an iframe at
  `height: 100%`, so nothing had ever needed to scroll and there was no `overflow-y` anywhere. A
  document-length page escapes into *document* scroll, dragging the topbar off the top. `.content`
  now has `min-height: 0` and `overflow-y: auto`. Measured, not eyeballed.
- **`children` rather than props is what makes the shell possible.** `/admin` is an async server
  component running live probes, so it can never be rendered *by* a client component — but it can be
  passed *through* one.
- **The glance gets counts and singles, never rows.** A hub handed thread arrays slowly becomes a
  worse copy of the tracker. `SOURCES` holds one entry today — a fact about the present, not a
  design limit.

## In flight

`claude/home-morning-paper-prototype` — the Morning Paper, open as #82. **Design approved by Joel on
2026-09-16**, and he lifted the privacy fold with it: *"drop above the fold below, ill manage
privacy."* So what is owed leads, job search included, and the layout enforces no privacy boundary.
**That amends a settled decision in `DECISIONS.md` and wants recording there.** The Feed is still
undefined and renders as a labelled slot; its open questions are with Joel.

## Next

1. **The hub's mobile login bug.** Both cheap explanations are ruled out from the code: `APPS`
   hardcodes the custom domains, and the cookie attributes are sound. It needs a live repro with
   devtools. **Reproduce in Chrome** — see `CLAUDE.md`; the WebKit cookie-policy theory is ruled out
   and cost a round already.
2. **`apps/home` still has no `test` script.** CI runs `npm run test --if-present`, so adding one
   opts the app in with no CI change. `lib/glance.ts`, `lib/diagnostics.ts` and `lib/pitwall.ts` are
   pure and untested. `editor` and `home` are the apps without tests.
3. **A style pass, deferred by Joel** — a monospace stack, a type scale to replace ten ad-hoc pixel
   values, and collapsing the three drifted copies of the micro-label rule (`.eyebrow`,
   `.sidebar-label`, `.slot-label`). Pick it up when he returns to it.
4. **`/api/version` is designed and undecided** — public, or behind the internal secret. The
   recommendation is public: it exposes a commit hash of a private repo and nothing else, and public
   is what lets an external monitor notice an outage, since `/api/health` sits behind the password
   gate. Joel's call.

Waiting on Joel: whether to raise the hairline contrast bar. `--line` against `--surface` is 1.82:1
in production, short of the 3:1 bar. Every new theme matches or beats it, so raising the bar changes
the look of every app — a decision, not a cleanup. It is in the ledger.
