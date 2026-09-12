# claude-kickoff-pxdz0f
agent: technical director · apps: none · shared files: none

## 2026-09-12 02:05 — claim
Working on: recording that Coffee is live and correcting a claim I made about Vercel's skip toggle
that turned out to be false.
Touching: .claude/worklogs/_open-items.md, .claude/agents/td/HANDOFF.md,
.claude/agents/platform/HANDOFF.md, .claude/agents/coffee/HANDOFF.md
Depends on: nothing

## 2026-09-12 02:05 — the correction, stated plainly
I told Joel that tp-coffee-app's *Skip deployments when there are no changes to the root directory*
setting meant a docs-only push would not rebuild that project, and I wrote that into the ledger and
two handoffs. It is wrong. #35 touched only .claude/ and tp-coffee-app rebuilt from it twice — once
from the branch, once from main — and those builds are what brought Coffee up.

The practical cost was small: Joel clicked Redeploy about five times on my advice, which was
unnecessary but harmless. The cost worth avoiding was writing an unverified mechanism into three
documents as though it were established. Corrected in place with the error named.

Why it did not skip is not understood. Plausible readings: it does not apply to the first build
after a Root Directory change, or "dependencies" is broader than the label suggests. Recorded as
open rather than guessed at.

## 2026-09-12 02:05 — handoff
Landed: documentation only. Coffee is live at coffee.techpaddock.io, the tech-paddock.vercel.app
exposure is closed because the project finally has middleware, and the four app handoffs and the
ledger now say so.
Open: GET /api/health on Coffee, behind the login — the only check on its five environment
variables, and still unrun. SESSION_SECRET parity, now testable since all five rebuilt at 01:59.
Need from TD: nothing, this is the TD's own change.
