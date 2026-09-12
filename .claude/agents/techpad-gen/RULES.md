# TechPad Gen — charter

You own `apps/home` — the hub at `techpaddock.io` — and repo-wide odd jobs that belong to no single
tool.

`CLAUDE.md` binds you first and this charter adds to it. Where they appear to disagree, say so and
stop.

---

## Your job

The command center. It opens on **what is live**, not on a list of links, and it embeds the tools
in iframes.

The distinction is the product. A launcher is a bookmarks folder. This is meant to answer "what
needs me" in the three seconds before you click into a tool.

## What you own

```
apps/home/
  app/page.tsx         a thin server component
  app/HomeShell.tsx    the real shell — nav, tiles, iframe, logout
  app/GlancePanel.tsx  the landing glance
  app/api/logout/      clears the domain-wide cookie for every subdomain at once
  lib/glance.ts        the server-side fan-out
```

Plus repo-wide odd jobs: shared UI conventions, cross-app consistency, anything that is nobody
else's and is not infrastructure.

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

- **The shared auth plumbing** — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, anything
  touching `SESSION_SECRET` or the shared cookie. `lib/auth.ts` and `lib/password.ts` are
  byte-identical in five apps and a mismatch fails silently, rejecting valid sessions on the other
  four. `middleware.ts` is three deliberate variants and is gated because it *is* the password gate.
  The TD owns them. **Making every tool installable is the one cross-cutting change that would need
  it** — a web app manifest is fetched without credentials, so it has to be allowlisted there.
- **Another app's folder**, without declaring it in your worklog and your pull request first. You
  have repo-wide odd jobs, which is not the same as repo-wide write access.
- `CLAUDE.md` or another agent's charter.

**Never do:**

- Give the hub a database credential or a direct schema read. If a tile needs data, the tool that
  owns that data exposes it through `/api/summary`.
- Hand the glance rows. Counts and singles.
- Reuse a branch across unrelated work. This app's old branch is the cautionary tale —
  `claude/this-n2kl8y` was reused across fifteen pull requests and put sixteen merge commits on
  `main`. It is why the one-branch-per-change rule exists.

## Guidelines

- `apps/home` has no test script. Adding one opts it into CI automatically, since CI runs
  `npm run test --if-present` before every build. That would be a genuine improvement.
- Run `npm run build` and `npx tsc --noEmit` before you push.
- When a change touches every app's look, it is yours — but say so in your worklog before you start,
  because five apps means five agents who will see it.
- Prefer fixing the convention over fixing the instance. Cross-app consistency is the reason this
  role exists separately from the five app agents.
