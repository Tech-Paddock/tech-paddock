# claude-brief-status-footer
agent: technical director · apps: none · shared files: CLAUDE.md
authorized by: Joel, directly, in session — "I want every message to give me a list of all open
items, urgency, and blocker status/affected agent at the bottom of every message so I don't have to
search. Typical all agents"

## 2026-09-16 00:40 — claim
Working on: a universal rule that every agent ends every message with an open-items footer.
Touching: CLAUDE.md only.
Depends on: #69, merged first so this rule change does not invalidate an open pull request.

## 2026-09-16 00:40 — second-order questions, before building
**What does this contradict?** Nothing settled. It sits alongside the Pit Wall rather than competing
with it: the wall is the durable board, the footer is the same facts in the reply Joel is already
reading. Deliberately reuses the wall's *never claim more than the source supports* rule instead of
inventing a second standard.

**Who else depends on it?** Every agent — it is a universal rule, so it binds six other charters
without editing any of them. The ledger is the shared source, which is why it does not need a new
file or a new tool.

**What becomes true afterwards that is not true now?** Every message carries a footer, including
one-line replies, so every agent must have read the ledger before it can answer anything. That is
already step 4 of the opening protocol, so the cost lands on sessions that skipped it.

**What does this make harder to change later?** Almost nothing — it is a presentation rule with no
schema, no endpoint and no environment variable. The one thing it fixes in place is the three-word
urgency vocabulary, which is worth fixing because two vocabularies for one set of facts is the
problem it exists to solve.

**Who decides this — the TD or Joel?** Joel, and he has. It is a CLAUDE.md edit, which is gated, and
he gave it directly.

## 2026-09-16 00:40 — the one thing worth getting right
The failure mode is not an agent forgetting the footer. It is an agent **filling it in for areas it
cannot see.** Agents never run at the same time, and as of #69 there are no worklogs left to read, so
an agent genuinely knows three things: the ledger it was handed at session start, its own handoff,
and the conversation in front of it. Anything else in that table is a guess wearing a table's
clothes, and a guess in a status footer is worse than a missing row because it reads as verified.

So the rule says what the visible set is, and says to name the owning agent from the ledger rather
than to report on that agent's behalf.

## 2026-09-16 00:45 — handoff
Landed: one rule at the end of *Always* in `CLAUDE.md`. Four columns — Item, Urgency, Blocking,
Agent — a three-word urgency vocabulary, "nothing open" required rather than omitted, and the
visible-set constraint above.
Open: nothing. The rule binds the TD too and this session starts complying with it immediately.
Need from TD: nothing — the TD wrote it.

Corrected before commit rather than after: the draft said there are no worklogs left to read between
agents, which was true for about five minutes after #69 and false the moment this file existed. The
rule now names the real visible set, including a worklog still live on an unmerged branch, and says
what such a worklog is worth — what was true when it was written, not where the work has got to.
