# Pipeline Tracker — handoff

State as of 2026-09-11, end of day.

Read `RULES.md` first. This file is only what is true right now.

---

## Your work landed as #22

`claude/tracker-dashboard-concept-r6p9up` is merged and the branch should be deleted. All of it
landed: the hub glance fan-out, the Microsoft Graph integration, the Vercel Cron sweep, meeting
matching, and this app's **first 38 tests**.

Three things about how that went, worth carrying:

**The `/api/summary` objection was withdrawn, and the TD was wrong to raise it.** It was flagged as
widening `INTERNAL_API_SECRET` into a shared key across four apps — a reading taken from the design
notes rather than from the route. The carve-out is `pathname === "/api/summary"` exactly, mirrors
the editor's `/api/draft` precedent, is read-only, fails closed without the secret, and times out at
four seconds. It followed the blessed pattern. Your narrow-shape discipline — counts and singles,
never rows, rich lists behind `loadDashboard` — is what made it reviewable, and it stands.

**Google Tasks → Microsoft To Do was approved.** You were right not to assume that edit would stand
on its own; a stack change the brief named explicitly needed sign-off and got it.

**Your `CLAUDE.md` edits were dropped**, not because they were wrong but because agents do not edit
the brief. That rule has since been sharpened: when what you are about to build contradicts the
brief, stop and ask *before* you build it, rather than building it and flagging at pull-request
time. Your tool's specification now lives in `RULES.md`, which you can propose changes to in a pull
request — so the dead end that used to exist is gone.

## The integration is built and inert

`MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_REFRESH_TOKEN` and `CRON_SECRET` are
**unset** on `tp-tracker`. The code degrades quietly by design, which is correct at runtime and
means **nothing will tell you the cron is doing nothing**.

Joel holds the Azure registration. It is on his list. **Chase it before building anything further
on top of Graph** — the daily sweep has never once run against real credentials, so every claim
about it is a claim about code that has not executed.

## Your app is live but stale

`tracker.techpaddock.io` is serving code from **17:48 today**, commit `92c1ec1`. Eleven merges to
`main` since then have not deployed, #22 included.

Not your bug and not yours to fix — Vercel's GitHub App lost its installation when the repo was
transferred. It is on Joel's list and the Platform agent's. **But it means the live site is not
running your code**, so nothing can be verified there. Test locally.

## Next steps

1. **Verify the daily sweep once the Microsoft credentials exist.** It has never run for real. That
   is the single largest untested surface you own.
2. **The deferred piece:** syncing a completed task back to reset `last_touch_date`. The base loop
   needs to be proven working first, which means step 1 comes before this.
3. Delete `claude/tracker-dashboard-concept-r6p9up`.
4. Nothing else is queued. Ask before starting anything larger than a fix.
