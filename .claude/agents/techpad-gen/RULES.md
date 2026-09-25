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
    page.tsx            `/` — the Morning Paper and the Pit Wall, as tabs
    admin/page.tsx      The Garage — declared against reported
  app/Chrome.tsx        topbar, sidebar, the content box
  app/Landing.tsx       glance, tiles, iframe
  app/GlancePanel.tsx   the glance, rendered
  app/Paper.tsx         the Morning Paper tab
  app/PitWall.tsx       the Pit Wall tab
  app/ThemeControl.tsx  the light/dark control — a stamped copy; edit packages/shared
  app/login/            deliberately outside the route group — pre-auth
  app/api/logout/       clears the domain-wide cookie for every subdomain at once
  lib/glance.ts         the server-side fan-out
  lib/pitwall.ts        the data layer — GitHub, Vercel, the repo
  lib/platform.ts       TOOLS — the only list of tools; its order is Joel's
  lib/diagnostics.ts    The Garage's live probes
  lib/theme.*           the token system — stamped copies; edit packages/shared
  scripts/collect-*.mjs build-time collectors — files above apps/home are unreadable at runtime
```

**And `apps/tracker`, inherited on 2026-09-19** when Joel retired the Pipeline Tracker agent, and
**parked since 2026-09-24** — Joel: *"I don't know what I'm doing with tracker."* Its code stays and
still builds; Joel pauses `tp-tracker`. **Parked means you do not build on it and you do not delete
it**; un-parking is his call. It keeps its name, `tracker.techpaddock.io`, the `tracker` Postgres
schema and its own `middleware.ts` variant.

**`apps/editor` is NOT yours.** It went to the technical director on 2026-09-19 because it is parked
and the work there is caretaking rather than product. **The tracker still calls it**: the
draft-follow-up hits the editor's `/api/draft`, so that contract is cross-agent and its scoping is
the TD's to approve.

**Read *The tracker's contracts* below before touching the tracker.** It is the most wired-in app
here: it calls the editor, the hub reads it, the Resume Formatter writes to it, and it reads two
other tools' tables. None of those went away with the agent, and all of them break quietly rather
than loudly.

**Deliveries — Vercel, DNS and CI — are Deployment's.** They came here from Platform Config on
2026-09-19, moved to the technical director with the merge on 2026-09-22, and moved again with the
merge to Deployment on 2026-09-24, so one seat still owns both sides of the gap between merging and
deploying. **`lib/pitwall.ts` still reads Vercel**, so the deployment-state traps in
`deployment/RULES.md` bind what the Pit Wall renders — read them there rather than keeping a copy
here.

Plus repo-wide odd jobs: shared UI conventions, cross-app consistency, anything that is nobody
else's and is not infrastructure.

**And the visual theme of every app.** `CLAUDE.md` names you its owner — palette, tokens, type,
spacing and the shared component language, in every app, not only the hub. An app agent may use
what exists freely and may duplicate a pattern locally if it says so; **changing or forking the
system is yours.** That grant reaches `app/globals.css`, `tailwind.config.ts`, the `<html>`
attributes in `layout.tsx`, the colour-bearing utility classes, `lib/livery.ts`, and the canonical
`lib/theme.*` and `app/ThemeControl.tsx` in `packages/shared` — edit those there and run
`node scripts/stamp-shared.mjs`, never a stamped copy. **It does not reach** `middleware.ts`, the
stamped auth files, `lib/supabase.ts` or any API route — a grant wider than the job is how a gate
gets talked past later.

## Two properties worth protecting

**The hub holds no database credential.** It reads no schema directly and is the only app with **no
Supabase dependency**. Keep it that way unless there is a reason that survives scrutiny. The keys it
does hold are `INTERNAL_API_SECRET`, for the glance, and `GITHUB_TOKEN`, for the Pit Wall, which
reads each project's production deployment from the statuses Vercel posts to GitHub (TEC-32).
**`VERCEL_TOKEN` is retired** — a full-power team token for reads the hub no longer makes — and The
Garage warns for as long as it is still set.

**The hub knows nothing about any tool.** `lib/glance.ts` fans out server-side to each tool's
`/api/summary` and renders whatever comes back. Adding a tool to the glance is a line in `SOURCES`,
not new knowledge in the hub.

What comes back is deliberately narrow — **counts and singles, never rows**. The hub is the three
seconds before you click into a tool; the tools are where the work happens. A hub handed thread
arrays slowly becomes a worse copy of the tracker, so it is never handed any. Hold that line even
when a richer tile would look better. Which tools are wired into `SOURCES` is read from the file;
the mechanism is general.

## Iframes and the cookie

The hub embeds the tools, which is why every app — the hub included, since `next.config.mjs` is
stamped from `packages/shared` — sends
`frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io`.

One login covers every subdomain because the session cookie is scoped to `.techpaddock.io`.
`/api/logout` here clears it everywhere at once — that is a hub responsibility, not a per-tool one.

---

## The tracker's contracts — inherited, and the reason it is wired in

The cross-schema ones are written down once, in `supabase/README.md`; this section is the tracker's
side of each.

### Draft-follow-up — you call the Message Editor

A button on each thread calls the editor's `/api/draft` directly, server to server, passing the
linked contact and the thread's notes. It authenticates with a shared `INTERNAL_API_SECRET` header
because a cross-app call carries no browser session.

The editor's middleware lets it through **for `/api/draft` only**, matched as an exact path. That
scoping is the blessed pattern here and **widening it is not yours to propose casually** — it is the
editor's route, the TD's veto, and a blanket auth bypass is what the narrowness exists to prevent.

### `shared.contacts` — you read it, the editor writes it

The tracker reads contacts and stores a `contact_id` on its threads; it never writes the table.
Writing to it from the tracker changes that contract, and it goes to Joel through the TD first.

### `/api/summary` — the hub reads you

The hub renders its landing glance by fanning out to each tool's `/api/summary` server-side. Yours
follows the same carve-out shape as above: `pathname === "/api/summary"` exactly, read-only, failing
closed without the secret, four-second timeout.

**Keep the shape narrow.** Counts and singles, never rows. Rich lists stay behind `loadDashboard`.
That discipline is what made the route reviewable, and it is why an objection to it was withdrawn
rather than sustained.

### Resume write-through — the Resume Formatter writes to you

The Resume Formatter is the submission layer. Naming a company when saving a render creates or
updates a thread here. You keep your own ad-hoc thread creation for applications and networking
threads that never involve a resume.

**Job details live here, not there.** Company, role, posting URL and contact are on the thread and
are never duplicated into `resume.renders`.

### Cross-schema reads — you read two other tools' tables

The dashboard derives last touch from what actually happened, so `loadDashboard` reads
`editor.message_history` (messages sent) and `resume.renders` and `resume.templates` (resumes
submitted) directly, read-only. A column renamed in either tool breaks your dashboard quietly — the
read degrades into a note rather than an error.

### The cron sweep and Microsoft Graph

**`/api/cron/stale-tasks` is behind `CRON_SECRET` twice**: the tracker's `middleware.ts` lets
`/api/cron/*` past the password gate only with the bearer, and the route checks it again, failing
closed with a 401 whether the secret is unset or merely wrong (#144, then the login hardening).
**`CRON_SECRET` must be set or the sweep does not run at all** — which is TEC-14. So un-parking the
tracker has no safety ordering left to get wrong, only that requirement.

**Microsoft Graph is built and inert.** `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` and
`MS_GRAPH_REFRESH_TOKEN` are unset, so the calendar, To Do and the sweep all degrade quietly.
**Nothing will tell you they are doing nothing.**

**The `tracker` Postgres schema and `tracker.pipeline_threads` are described by their migrations**
in `supabase/`, which is where that detail is measured rather than restated.

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
- Reuse a branch across unrelated work. This app's old branch is the cautionary tale in `CLAUDE.md`.

## Guidelines

- Run `npm run build` and `npx tsc --noEmit` before you push.
- When a change touches every app's look, it is yours — but say so in your pull request, because
  every other agent will find the result in their own app without having asked for it.
- Prefer fixing the convention over fixing the instance. Cross-app consistency is the reason this
  role exists separately from the app agents.
