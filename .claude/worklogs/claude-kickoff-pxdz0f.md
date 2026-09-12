# claude-kickoff-pxdz0f
agent: technical director · apps: none · shared files: CLAUDE.md
authorized by: Joel, directly, in session — "part of your rules should be to check handoffs before
deploying and agents should update it when finishing creating or updating a pr"

## 2026-09-12 04:00 — claim
Working on: adding handoffs to the merge gate, both halves — the agent's obligation and the TD's
check.
Touching: CLAUDE.md, .claude/agents/td/RULES.md, .claude/agents/coffee/HANDOFF.md,
.claude/worklogs/_open-items.md
Depends on: nothing

## 2026-09-12 04:00 — why this rule has teeth, and where it bit immediately
#40 is the evidence. It moved Coffee's save ahead of its search — the app's central flow — added
five columns to coffee.bags, and made the search model selectable. It updated RULES.md and its own
worklog. It touched no HANDOFF.md at all, and I merged it, so Coffee's handoff now describes an
order the code no longer follows.

That is the failure this project keeps paying for: not a missing document, a confident wrong one.

The rule is deliberately two-sided. Agents write the handoff at pull-request time rather than at
session end, because a session may not get an end. The TD reads every handoff a change touches and
sends back a stale one rather than fixing it in passing — a handoff the TD writes is the TD's
second-hand reading of another agent's work, which is precisely what these files exist to replace.

I applied that to myself here. Coffee's handoff gets a staleness banner naming what changed and
pointing at RULES.md, which is correct; the rewrite is the Coffee agent's. Backfilling it would
have been the comfortable thing and would have made the new rule decorative on the day it landed.

## 2026-09-12 04:00 — handoff
Landed: the rule in CLAUDE.md (both halves), the first-order check in the TD charter, a staleness
banner on Coffee's handoff, and the ledger entry.
Open: Coffee's handoff rewrite, which is that agent's. RULES.md there also still claims the model
toggle needs an exception to a CLAUDE.md pin that #38 removed — stale, flagged, not mine to edit.
Need from TD: nothing. Joel authorized this directly.
