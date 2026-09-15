# claude-techpad-gen-admin-in-shell
agent: TechPad Gen · apps: home · shared files: none

## 2026-09-15 — claim
Working on: putting `/admin` inside the hub's chrome — topbar and sidebar — instead of the
standalone page with a "← Paddock" text link it shipped as.
Touching: `apps/home/app/` only — a new `(shell)` route group, `Chrome.tsx`, `Landing.tsx`,
`globals.css`, and `admin/page.tsx`.
Depends on: **`claude/techpad-gen-handoff-current` (PR #58), which this branch is cut from.**

**Stacked deliberately, and the order matters.** Both branches edit
`.claude/agents/techpad-gen/HANDOFF.md`, and #58's corrected version is not on `main` yet. Branching
from `main` would mean editing a handoff I already know to be wrong and then conflicting with its own
fix. **Merge #58 first, then this.**

Per the brief's warning about squash merges under a stack: once #58 lands, `main` will carry it as
one new commit whose identity git cannot match to what this branch inherited, so this branch will
show a `HANDOFF.md` conflict with no real disagreement in it. The remedy the brief gives is to
compare `main`'s copy of the file against what this branch inherited — if identical, taking the
branch side is lossless as a matter of fact rather than judgement.

## 2026-09-15 — the part that is not moving markup
The shell was built around an iframe and assumes its content is exactly viewport height: `.page` is
`height: 100vh`, `.shell` is `flex: 1; min-height: 0`, and `.content` is a flex row with **no
`overflow-y`**. There is no `overflow-y` anywhere in the 713-line stylesheet, because nothing has
ever needed to scroll — `.app-frame` is `height: 100%` and the landing glance is short.

The admin page is about 1570px tall. Dropped into `.content` as-is it would **not** be clipped; it
would escape into *document* scroll, dragging the topbar off the top while `.shell` stayed capped at
one viewport, leaving the sidebar's surface ending partway down the page with bare `--paper` beside
the content.

So `.content` gains `min-height: 0` and `overflow-y: auto`. That is the general fix rather than an
admin special case — it makes the chrome able to hold any document, which is the point of extracting
it — and it is safe for both existing cases.

## 2026-09-15 — handoff
Landed on this branch: `/admin` inside the hub's chrome. `apps/home` only — no other app, no
`middleware.ts`, no schema, no environment variable.

`tsc --noEmit` and `npm run build` clean. `/` and `/admin` are both still `ƒ` (dynamic) and the URLs
are unchanged, which is the point of a route group.

**Measured rather than eyeballed**, because the scroll behaviour was the whole risk. Scrolling
`/admin` to its end moves `.content.scrollTop` to **841** while `window.scrollY` stays **0**, the
topbar stays visible, and the sidebar's bottom edge equals the viewport height (800 = 800). The
failure predicted for the unfixed version — chrome sliding away, sidebar surface ending mid-page —
does not occur. Also confirmed: `/login` renders **zero** `.topbar`/`.sidebar` elements, `Admin` is
the only active nav item on `/admin`, and the admin eyebrow is visible again at 390px.

One regression I introduced and caught in a screenshot rather than in review: turning the nav buttons
and the tiles into links underlined every label, because `.nav-item` and `.app-button` had never
needed `text-decoration`. Fixed.

Open: nothing in this change.

**Need from TD — merge order.** This branch is stacked on `claude/techpad-gen-handoff-current` (#58)
and both edit `HANDOFF.md`. **#58 first.** Once it squash-merges, this branch will show a
`HANDOFF.md` conflict with no real disagreement in it; the brief's remedy is to compare `main`'s copy
against what this branch inherited and, if identical, take the branch side.

**Deployment:** nothing to do. Vercel rebuilds `tp-home` on merge and that is the whole procedure —
no environment variable, no dashboard setting, no migration, no DNS. Verify by opening
`techpaddock.io/admin` after the deploy: sidebar present with Admin highlighted, and scrolling leaves
the topbar and sidebar in place. If it is never deployed, nothing breaks — `/admin` keeps its current
standalone layout. URLs do not change, so existing links to `/admin` keep working.

**No pull request opened**, per the brief's new rule: the finished branch is the deliverable and
asking for a pull request is Joel's call.
