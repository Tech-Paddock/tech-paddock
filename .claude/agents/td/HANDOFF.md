# Technical Director — handoff

State as of 2026-09-24. `RULES.md` has the role, `DECISIONS.md` the reasoning; this is only what is
true and the traps. Open work is in Linear, team TEC. **Branch and pull request state is never
written here** — read it live.

---

## Where the work is

**The deployment layer is no longer yours.** Since 2026-09-24 the Deployment agent opens, gates,
orders and merges every pull request, applies migrations at the gate and owns Vercel, DNS and CI.
**You start every agent as your helper, from its preset, after Joel says go** — Opus 5.5 at medium
for all of them. TEC-40 is that change.

**TEC-27, the post-refactor review, is merged** (#201 to #205) and its sub-issues TEC-28 to TEC-32
are each agent's to work, started by you. **Still Joel's:** TEC-33 steps 3 and 4 (re-pause the
editor, pause the tracker), step 6 and TEC-7 (the firewall rate limit), and TEC-38. **Still yours:**
TEC-35 step 4 in a fresh session, and TEC-7's read-only check once the rule exists. **TEC-34** is the
Next.js 14 → 16 upgrade. The parking lot is the `Parked` label.

## What is true now

- **Every project was READY in production on the login hardening** (#201, via #202's deploy) on
  2026-09-24, the editor included. The TD's container cannot reach `*.techpaddock.io` — the network
  policy refuses it — so the login behaviour itself was never checked from here.
- **The hooks are one guard** (`.claude/hooks/guard.mjs` → `decide.mjs`, cases in `guard.test.mjs`,
  run by CI). It fails closed. Opening a pull request is not held; merging is.
- **Every agent edits Linear without asking Joel.** The guard still refuses an issue that breaks the
  issue rules.
- **The weekly Routine** "Weekly rules-drift audit" (Mondays 08:00 UTC) reads Linear and runs `drift`.
  Its prompt still describes the TD as the gate; it is report-only, so that misleads nobody into
  acting, but its next run will flag the change as drift.

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
- **The hub holds `GITHUB_TOKEN` and `VERCEL_TOKEN`** for the Pit Wall's reads — the most powerful
  credentials in the estate, on the app that holds no database key. TEC-32 item 4 and TEC-33 step 5
  are how that shrinks.
- **Build in a worktree, never the main checkout.** Building the hub rewrites three tracked
  `apps/home/lib/*.generated.ts` files; restore them before committing. TEC-32 item 6 ends it.
- **Cost is context × turns.** A helper's report lands in your context: brief tightly, and end the
  session once the branches are pushed.
- **You cannot delete a remote branch**, and **you are a session, not a service.** Say which.
