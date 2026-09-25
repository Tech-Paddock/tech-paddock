# Health — handoff

State as of 2026-09-25. Read `RULES.md`, then the Linear document "Health — plan" (team TEC) before
changing a feature. Open work is the Linear issues labelled `agent:Health`, nothing here.

---

## The macro log is live

Dictate what you ate, approve the draft, it is logged with the day's running total; `/debug` runs
both models on one food and keeps every run. **Every `health` table held 0 rows on 2026-09-25**
(`pg_stat_user_tables`) — nothing logged yet, the harness never run.

## How it works, in the order it matters

**The lookup order is the product**, in `lib/log.ts:resolveItem`. Exact match on the normalised name;
a miss goes outside to one model call; approval writes it back, so outside runs once per food ever.

**Item numbers are append-only.** `health.items` is identity, `health.item_versions` is what it
weighed over time, nothing updated in place. `lib/items.ts:resolveVersion` picks the version for a
date: the era with the greatest `effective_from` on or before it, then the newest row in that era.

**Each logged line snapshots its numbers** (TEC-21, migration `20260925134431`): `entry_items`
carries the four macros and the `item_version_id` they were copied from. `readDay` is a plain sum,
so **a correction fixes the food from the next log on and never moves a day already logged** —
including the line you opened the correction from. `resolveVersion` runs only at log time.
**`kind` keeps a job**: it is what a backfill would read to tell a day that was wrong (`correction`)
from one that was right at the time (`change`). No backfill exists; it would be a deliberate step.

**Approving decides every line before writing anything** — `lib/approve.ts:decideLine`, tested.
A number is `hand` only when the line says it was typed over; a difference nobody typed, a line
whose `item_id` no longer matches its name, a failed line or a food on the draft twice is a 409
and nothing is written. **A renamed draft line is cleared and looked up again** through
`/api/resolve` when the field loses focus; approve waits until every line has numbers. Same-name
lines from one dictation merge, quantities added, before anything is estimated.

## The grocery list

`/list` adds lines, ticks them off, copies the lot, or taps one into a King Soopers search. **It
leaves as text or a link — no stored credential, no OAuth, no `middleware.ts` edit.** **Tidy is the
one model call and it is two-step**: Haiku proposes a merge, `validateTidy` refuses one that drops or
double-counts a line before you see it, you approve what survives.

**The list is leaving for Cookbook** (TEC-15, sequenced 2026-09-23; the charters say so since that
change merged). It stays here until Health's part lands; recipes already left on 2026-09-20.

## Traps specific to this seat

- **The snapshot columns are nullable until a follow-up makes them `NOT NULL`.** `readDay` resolves
  a line with no snapshot the old way rather than summing it as zero; that fallback goes with the
  follow-up. The CHECK `entry_items_snapshot_whole` makes a snapshot all-or-nothing.
- **`lib/models.ts` is Coffee's registry duplicated and flagged, not a verbatim copy** — the two
  have diverged. Do not let a third copy happen quietly.
- **The livery is borrowed and has a collision.** `senna`, which the parked tracker also wears, maps
  `--sev-warn` onto the accent, so "over target" and "on track" are one colour. TechPad Gen's.
- **A failed lookup must never look like "not found."** `LookupError` keeps them apart and every
  route turns it into a 503. Degrading into internet-first changes nothing on screen.
- **`eaten_at` is not the time you ate.** The app never sets it, so it duplicates `created_at`;
  `eaten_on` is what a day's total reads. Both carry column comments.
- **The hosted API stamps its own migration version and ignores your filename.** Check
  `migration list` rather than assuming.
- **`www.kingsoopers.com` is refused by the egress proxy**, so the `/q/` search shape could not be
  verified live. One constant in `lib/grocery.ts`, and its comment says how much it is worth.
