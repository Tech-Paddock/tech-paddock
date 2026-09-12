# TechPad Gen — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## Your work landed; your branch is gone

`claude/this-n2kl8y` has been deleted. Its UI work merged as **#19** — team-coloured banner,
relocated logout, header subtitle, Paddock-led tab titles. The subtitle was re-applied on top of the
dashboard's rewrite of `apps/home/app/page.tsx` rather than being dropped in the conflict.

That branch is also the cautionary tale behind one-branch-per-change: reused across fifteen pull
requests, sixteen merge commits on `main`. Start fresh every time.

## The hub is now a dashboard

`app/page.tsx` is a thin server component; the real shell is `HomeShell.tsx`, fed by `lib/glance.ts`
which fans out to each tool's `/api/summary`. **If you are adding a tile or changing the chrome,
that is where it lives now** — not in `page.tsx`, which is where it used to be.

`APPS` in `HomeShell.tsx` currently lists four tools: editor, tracker, resume, coffee.

## A brief edit that was held, and is now unblocked differently

Your Known Issues note about the mobile login bug was deliberately held back from #19, because
agents do not edit `CLAUDE.md`.

**That constraint has changed shape.** `CLAUDE.md` is now routing and universal rules only; your
tool's specification lives in this folder, which you can propose changes to in a pull request. The
mobile login bug belongs in this handoff and in your worklog — it is recorded below, so the note no
longer needs to go anywhere else.

## The open bug, and why the obvious explanation does not fit

Opening a tool from the hub's iframe-embedded tiles re-triggers that app's own login screen on
mobile, even though the session cookie is domain-wide and one login is meant to cover every app.

**It was reported on mobile Chrome, not just Safari.** So the obvious explanation — Safari/WebKit
third-party cookie partitioning, ITP — does not fit on its own and needs re-diagnosing rather than
assuming.

**Start by checking what URL the iframe actually loads.** The cookie is host-only off
`techpaddock.io` by design, so an iframe pointing at a `*.vercel.app` preview URL rather than the
custom domain would produce exactly this symptom without any cookie-policy explanation at all.

This is a genuine open bug and good next work.

## One complication before you test anything

**Resolved 2026-09-12.** `techpaddock.io` serves `0c7d882` and returns 200 with the password gate
intact. The outage that pinned every app to `92c1ec1` for six and a half hours is over.

For you specifically: **the mobile login bug is now reproducible against the live site again**, which
it was not while the site ran stale code. That was the blocker on diagnosing it. Start by checking
what URL the iframe actually loads — the Safari/ITP theory does not fit a report from mobile Chrome.

Also note `coffee.techpaddock.io` does not exist yet — `apps/coffee` is built and merged but its
Vercel project still points at the repo root. The Coffee tile in `APPS` currently points at a
domain that does not resolve.

## Next steps

1. **Diagnose the mobile login bug**, starting with the iframe's actual URL rather than with cookie
   policy.
2. Consider adding a `test` script to `apps/home`. CI runs `npm run test --if-present`, so adding
   one opts the app in with no CI change. `editor` and `home` are the two apps without tests.
3. Start every change on its own branch.
