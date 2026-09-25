# Technical Director — handoff

State as of 2026-09-25. `RULES.md` has the role, `DECISIONS.md` the reasoning; this is only what is
true and the traps. Open work is in Linear, team TEC. **Branch and pull request state is never
written here** — read it live.

---

## Where the work is

**The deployment layer is no longer yours.** Since 2026-09-24 the Deployment agent opens, gates,
orders and merges every pull request, applies migrations at the gate and owns Vercel, DNS and CI.
**You start every agent as your helper, from its preset, after Joel says go** — Opus 5.5 at medium
for all of them. TEC-40 is that change.

**Joel's working model (2026-09-25): one gate.** Agents cut branches and commit, never a pull
request. When branches are ready you bring Joel one list: branches, order, blast radius,
migrations, questions. His go starts Deployment on exactly that list, and he hears nothing more
about pull requests or merges unless a question comes up. **Nothing enforces the list's scope** now
that merging asks no click (TEC-43). **Roll up only serious questions**; small calls in an app are
yours, logged on the issue.

**The 2026-09-25 train is merged: all 17 branches, #211–#227.** Joel's live checks on TEC-28, TEC-32
and TEC-47 are done. **Joel pauses the editor and the tracker once all deployments are done**
(2026-09-25: "too much stuff in flight"). Confirm TEC-33 step 1, the `INTERNAL_API_SECRET` rotation,
is live before he does, because a paused project can't redeploy. **Joel answered on TEC-7 (option A:
add the rules), TEC-12, TEC-42, TEC-59 and TEC-33**, so read those comments first. **TEC-34 (Next.js
14 → 16) is on hold** (Joel). The parking lot is the `Parked` label.

## What is true now

- **Every project was READY in production on the login hardening** (#201, via #202's deploy) on
  2026-09-24, the editor included. The TD's container cannot reach `*.techpaddock.io` — the network
  policy refuses it — so the login behaviour itself was never checked from here.
- **The hooks are one guard** (`.claude/hooks/guard.mjs` → `decide.mjs`, cases in `guard.test.mjs`,
  run by CI). It fails closed. Opening, updating and squash-merging a pull request are not held;
  auto-merge, reviews and the API commit tools still ask.
- **Linear writes from this session go through without a prompt; a helper's still prompt Joel**
  (TEC-59). Until that is fixed, **helpers make no Linear writes**: they list the changes in their
  report and you apply them. Deletes, label retirement and the diff tools still ask (the `ask` list
  in `.claude/settings.json`). Joel asked for no Linear friction; removing that list needs his words.
- **The weekly Routine** "Weekly rules-drift audit" (Mondays 08:00 UTC) reads Linear and runs `drift`.
  Its prompt still names the TD as the gate until TEC-42; it is report-only, so that misleads nobody
  into acting, but a run before TEC-42 will report the move as drift.

## Traps only here

- **The GitHub integration closes a Linear issue when a pull request naming it merges** — in its
  title or its body. TEC-27 and TEC-35 were closed that way with work still open. After a merge,
  reopen any issue whose Next steps are not all done.
- **The auto-mode classifier can refuse work under `.claude/hooks/`** after an edit there, reads
  included, as self-modification. Take it to Joel; never route round it.
- **A Linear patch matches the stored text**, where a `TEC-n` you wrote is stored as an issue-mention
  tag. Copy an anchor from `get_issue`'s output, tags and all; a retyped `TEC-n` never matches.
- **A helper can be refused an action this session is allowed** — the permission system decides per
  call. Take it to Joel; never re-run the refused action yourself.
- **Put a decision to Joel as a multiple-choice question** (`AskUserQuestion`), never prose. It is
  in your charter once TEC-71 merges; follow it anyway until then.
- **A migration is recorded under a new version at the gate** and the file is renamed to match, so
  cite it by name (TEC-72). Plan the one-line handoff fix the author owes if an id was cited.
- **The auto-mode classifier refuses edits to `.claude/` and to another agent's charter** as
  self-modification or instruction poisoning, even with an approved issue behind it. It cleared
  once Joel's own words named the change. Ask him for them; never route round it.
- **Cost is context × turns.** A helper's report lands in your context: brief tightly, and end the
  session once the branches are pushed.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
