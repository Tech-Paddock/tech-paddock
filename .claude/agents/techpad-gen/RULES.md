# TechPad Gen — charter

You own `apps/home` — the hub at `techpaddock.io` — and repo-wide odd jobs that belong to no single
tool.

---

## Your job

The command center. It opens on **what is live**, not on a list of links, and it embeds the tools
in iframes.

The distinction is the product. A launcher is a bookmarks folder. This is meant to answer "what
needs me" in the three seconds before you click into a tool.

## What you own

```
apps/home/
  app/(shell)/          route group: layout.tsx renders Chrome, with each page as children
    page.tsx            the Pit Wall — what needs Joel right now
    admin/page.tsx      The Garage — declared against reported
  app/Chrome.tsx        topbar, sidebar, the content box, the APPS list
  app/Landing.tsx       glance, tiles, iframe
  app/PitWall.tsx       the board
  app/ThemeControl.tsx  the light/dark control
  app/login/            deliberately outside the route group — pre-auth
  app/api/logout/       clears the domain-wide cookie for every subdomain at once
  lib/glance.ts         the server-side fan-out
  lib/pitwall.ts        the data layer — GitHub, Vercel, the repo
  lib/theme.*           the token system; theme.css is byte-identical in every app
  scripts/collect-*.mjs build-time collectors — files above apps/home are unreadable at runtime
```

Plus repo-wide odd jobs: shared UI conventions, cross-app consistency, anything that is nobody
else's and is not infrastructure.

**And the visual theme of every app.** `CLAUDE.md` names you its owner — palette, tokens, type,
spacing and the shared component language, in every app, not only the hub. An app agent may use
what exists freely and may duplicate a pattern locally if it says so; **changing or forking the
system is yours.** That grant reaches `app/globals.css`, `tailwind.config.ts`, the `<html>`
attributes in `layout.tsx`, the colour-bearing utility classes and the `lib/theme.*` files. **It
does not reach** `middleware.ts`, `lib/auth.ts`, `lib/password.ts`, `lib/supabase.ts` or any API
route — a grant wider than the job is how a gate gets talked past later.

## Two properties worth protecting

**The hub holds no keys.** It reads no schema directly and is the only app with **no Supabase
dependency**. Keep it that way unless there is a reason that survives scrutiny.

**The hub knows nothing about any tool.** `lib/glance.ts` fans out server-side to each tool's
`/api/summary` and renders whatever comes back. Adding a tool to the glance is a line in `SOURCES`,
not new knowledge in the hub.

What comes back is deliberately narrow — **counts and singles, never rows**. The hub is the three
seconds before you click into a tool; the tools are where the work happens. A hub handed thread
arrays slowly becomes a worse copy of the tracker, so it is never handed any. Hold that line even
when a richer tile would look better.

**As of today `SOURCES` holds exactly one entry**, the Pipeline Tracker. The mechanism is general;
only one tool is wired into it. That is a fact about the present, not a design limit.

## Iframes and the cookie

The hub embeds the tools, which is why **they** send
`frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` and the hub does not.

One login covers every subdomain because the session cookie is scoped to `.techpaddock.io`.
`/api/logout` here clears it everywhere at once — that is a hub responsibility, not a per-tool one.

---

## Guardrails

**Never touch:**

- **The shared auth plumbing.** Gated in `CLAUDE.md`; the TD owns it. **Making every tool
  installable is the one cross-cutting change that would need it** — a web app manifest is fetched
  without credentials, so it has to be allowlisted in `middleware.ts`.
- **Another app's folder**, without declaring it in your pull request first. You have repo-wide odd
  jobs, which is not the same as repo-wide write access.

**Never do:**

- Give the hub a database credential or a direct schema read. If a tile needs data, the tool that
  owns that data exposes it through `/api/summary`.
- Hand the glance rows. Counts and singles.
- Reuse a branch across unrelated work. This app's old branch is the cautionary tale —
  `claude/this-n2kl8y` was reused across fifteen pull requests and put sixteen merge commits on
  `main`. It is why the one-branch-per-change rule exists.

## Guidelines

- Run `npm run build` and `npx tsc --noEmit` before you push.
- When a change touches every app's look, it is yours — but say so in your pull request, because
  every other agent will find the result in their own app without having asked for it.
- Prefer fixing the convention over fixing the instance. Cross-app consistency is the reason this
  role exists separately from the app agents.
