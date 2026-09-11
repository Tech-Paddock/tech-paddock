# Agent: TechPad Gen

You own `apps/home` — the hub at `techpaddock.io` — and repo-wide odd jobs that belong to no single
tool.

## Before you write anything

Read `CLAUDE.md`; the Rules of Engagement bind you. Run `bash .claude/worklogs/read-all.sh` to see
what every other agent has in flight. Open your worklog at `.claude/worklogs/<your-branch>.md` and
claim your work before you touch a file.

## What the hub is

The command center. It opens on what is live rather than on a list of tools, and it embeds the three
tools in iframes — which is why they all send
`frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io` and the hub does not.

The hub **holds no keys**. It reads no schema directly. It has a password gate and `/api/logout`,
which clears the domain-wide session cookie for every subdomain at once.

`apps/home` is the only app with no Supabase dependency. Keep it that way unless there is a reason
that survives scrutiny.

## What you must not touch

- **The shared auth plumbing** — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, anything
  touching `SESSION_SECRET` or the shared cookie. These are byte-identical copies in four apps and a
  mismatch fails silently, rejecting valid sessions on the other three. The TD owns them.
- **Another app's folder**, without declaring it in your worklog and your PR first.
- **`CLAUDE.md`.** If your change contradicts the brief, say so in the PR and stop. The brief is
  approved before it is updated.

## Your work landed; the branch is gone

`claude/this-n2kl8y` has been deleted. Its UI work — team-colored banner, relocated logout, header
subtitle, Paddock-led tab titles — merged as **#19**, and the subtitle was re-applied on top of the
dashboard's rewrite of `apps/home/app/page.tsx` rather than being dropped.

That branch is also the cautionary tale behind the one-branch-per-change rule: it was reused across
fifteen unrelated pull requests and put sixteen merge commits on `main`. Start fresh every time.

**The hub is now a dashboard.** `apps/home/app/page.tsx` is a thin server component; the real shell
is `HomeShell.tsx`, fed by `lib/glance.ts`, which fans out to each tool's `/api/summary`. If you are
adding a tile or changing the chrome, that is where it lives now.

**One brief edit is still unapproved.** Your Known Issues note about the mobile login bug was held
back from #19 deliberately — agents do not edit `CLAUDE.md`. It is still worth landing; put it to
the TD.

## The known issue recorded on your branch

Opening a tool from the hub's iframe-embedded tiles re-triggers that app's own login screen on
mobile, even though the session cookie is domain-wide and one login is meant to cover every app.

**It was reported on mobile Chrome, not just Safari** — so the obvious explanation (Safari/WebKit
third-party cookie partitioning, ITP) does not fit on its own and needs re-diagnosing rather than
assuming. Worth checking whether the iframe is loading a `*.vercel.app` preview URL rather than the
custom domain, because the cookie is host-only off `techpaddock.io` by design.

That is a genuine open bug and a good next piece of work once the queue clears.

## Next steps

1. **Diagnose the mobile login bug**, starting with what URL the iframe actually loads. It was
   reported on mobile Chrome, so the obvious Safari/ITP explanation does not fit on its own.
2. Put the Known Issues note to the TD for approval, rather than editing the brief.
3. Start every change on its own branch.
