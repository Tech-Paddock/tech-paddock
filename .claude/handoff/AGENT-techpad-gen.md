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

## Your branch: `claude/this-n2kl8y`

Four commits ahead of `main`, one behind. Third in the merge queue.

**Careful — this branch has history.** It is the branch that produced sixteen merge commits on
`main` by being reused across fifteen unrelated pull requests. That is the specific failure the
one-branch-per-change rule exists to prevent. **Do not keep using it.** Land what is on it, then
start a fresh branch per change.

What is on it: a team-colored home banner, a relocated logout, a header subtitle, and a note in
`CLAUDE.md` recording a mobile login bug.

**A conflict you will hit.** The `tracker-dashboard` branch merges before yours is fully settled and
it *rewrites* `apps/home/app/page.tsx` from a client component into a server component
(`HomeShell` + `loadGlance`). Your topbar subtitle is an edit to the version being deleted. The
dashboard's structure wins; re-apply the subtitle on top of it. This is not your work being
discarded — it is being moved.

## The known issue recorded on your branch

Opening a tool from the hub's iframe-embedded tiles re-triggers that app's own login screen on
mobile, even though the session cookie is domain-wide and one login is meant to cover all four apps.

**It was reported on mobile Chrome, not just Safari** — so the obvious explanation (Safari/WebKit
third-party cookie partitioning, ITP) does not fit on its own and needs re-diagnosing rather than
assuming. Worth checking whether the iframe is loading a `*.vercel.app` preview URL rather than the
custom domain, because the cookie is host-only off `techpaddock.io` by design.

That is a genuine open bug and a good next piece of work once the queue clears.

## Next steps

1. Wait for the queue: PR #17, then your branch, then `tracker-dashboard`.
2. Re-apply the subtitle on the dashboard's rewritten page.
3. Diagnose the mobile login bug properly, starting with what URL the iframe actually loads.
4. Start every subsequent change on its own branch.
