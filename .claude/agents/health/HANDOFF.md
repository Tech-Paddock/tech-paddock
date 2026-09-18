# Health — handoff

State as of 2026-09-18.

Read `RULES.md` first, then `.claude/HEALTH-PLAN.md`. This file is only what is true right now.

---

## The area exists and the product does not

**This is day one, and an almost-empty handoff is the correct shape for it.** The scaffold landed
before you did, so that you inherit rails rather than a set of decisions somebody else made about
your tool.

## What is true now

**`apps/health` builds, deploys and sits behind the password gate.** It was copied from
`apps/coffee`, the nearest existing app in kind. `lib/auth.ts`, `lib/password.ts` and `lib/theme.css`
are **byte-identical** copies, verified by checksum rather than assumed, and `middleware.ts` is the
**base** copy — a fourth variant fails `drift` deliberately, because that would be a fourth version
of the password gate.

**`app/page.tsx` is a placeholder and says so on the page.** It is not a first guess at the real
screen. Replacing it is your first substantive change.

**The `health` schema exists and is empty.** `20260918140357` creates it, `20260918140405` grants it,
both applied before the scaffold merged. **Zero tables, on purpose** — the plan's macro tables are
yours to design, and it says in its own words that everything in it is the first feature of `health`
rather than the whole of it.

**`/api/health` is live and probes three things**: the schema is reachable, the Anthropic key is
present and shaped right, and `SESSION_SECRET` is set. The database probe **names the exposed-schemas
dashboard list in its failure message**, because that step is outside this repo and is the one the
standup protocol says gets missed.

## Waiting on Joel, outside this repo

None of these has an undo and no agent may do them. Until they are done the app is built but not
reachable, which does not block you from working.

1. **Root Directory → `apps/health`** on the `tp-health` Vercel project. Until then it builds the
   repo root.
2. **`health.techpaddock.io` attached** to that project. The Cloudflare record already exists and
   points at a host Vercel does not yet claim.
3. **Environment variables**, `SESSION_SECRET` **byte-identical** to the other five, then a redeploy —
   Vercel bakes the environment in at build time.
4. **`health` added to the exposed-schemas list** in the Supabase dashboard.

## Traps specific to this seat

- **The livery is borrowed.** `lib/livery.ts` pins `senna`, which the paused tracker also wears, and
  **two apps sharing a livery is the drift the one-owner theme rule exists to prevent.** It is
  TechPad Gen's to settle. Do not fix it here.
- **Read `supabase/README.md` before your first migration.** The hosted API stamps its own version
  and ignores your filename, so name the file after the fact and check `migration list` rather than
  assuming. Both migrations above were renamed to the versions that actually ran.
- **`supabase migration list` will always show one remote-only version**, `20260908235234`. That is
  deliberate and permanent. A *second* discrepancy means something drifted and is worth reading.

## Next

**Design the tables, then build the one screen.** In that order, and nothing before it: the plan is
agreed, the schema is empty and waiting, and the lookup order in `RULES.md` is the product.

**Everything else waiting is in the ledger**, which the `SessionStart` hook prints for you.
