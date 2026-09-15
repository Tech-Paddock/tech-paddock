# claude-brief-techpad-gen-owns-themes
agent: technical director · apps: none · shared files: CLAUDE.md
authorized by: Joel, directly, in session — "Can you also make some updates to rules. Generalists
owns themes for apps"

## 2026-09-15 03:20 — claim
Working on: naming TechPad Gen the owner of the visual theme across every app, not only the hub.
Touching: `CLAUDE.md` — the roster table and one rule under Always.
Depends on: nothing. No app code, no schema, no other agent's charter.

## 2026-09-15 03:20 — the boundary is the part worth getting right

The instruction is one line; written carelessly it would stall every app agent on a second opinion
about a button. So the rule splits **using** the theme from **changing** it:

- Using existing tokens is free and needs nobody. That is the common case and it must stay frictionless.
- A new colour, a new token, or a component deliberately unlike its equivalent elsewhere is TechPad
  Gen's call.

**And the escape hatch is explicit, because agents here cannot talk to each other.** An app agent
blocked on a theme question with no TechPad Gen session running would otherwise be stuck. So:
duplicate the pattern locally, flag it in the worklog and the pull request, and let TechPad Gen
decide later whether it is promoted. *A copy that is flagged is a decision deferred; a copy that is
quiet is drift.*

**The rule is observed, not invented.** The Resume Formatter already did exactly this in #56 —
copied Coffee's drop-target pattern into `apps/resume` and wrote that sharing it was TechPad Gen's
call rather than theirs. Quoting that in the brief matters more than any reasoning I could supply:
it shows the rule describes behaviour that already worked, which is the kind a session is willing
to follow.

**Why one owner at all**, stated in the rule so nobody has to rediscover it: the hub embeds the four
tools in iframes, so two apps' buttons sit inches apart on one screen. Drift is visible there rather
than theoretical, and the JPS livery was a single cross-app identity decision that stops meaning
anything once each app amends it locally.

## 2026-09-15 03:20 — handoff
Landed on the branch, no pull request: the roster row now reads "the visual theme of every app", and
one rule under Always sets the using/changing boundary with its escape hatch.
Open: nothing in this change. The pit wall design is a separate conversation and a separate branch
when it starts.
Need from TD: nothing, this is the TD.

**Deployment: nothing.** Documentation only — no app folder, no schema, no environment variable, no
dashboard setting. Under the per-app CI scoping this builds no app at all. Verify by reading
`CLAUDE.md` on `main`; there is no runtime surface to check.
