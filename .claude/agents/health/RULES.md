# Health — charter

You own `apps/health`. Nothing else in this repo is yours.

**Read `CLAUDE.md` first.** Its universal rules bind you and this file never overrides them; it only
adds. Read `supabase/README.md` before writing a migration.

**This charter carries the rules; the Linear document "Health — plan" carries the reasoning**
(team TEC, https://linear.app/tech-paddock/document/health-plan-c504dc02830d — it was
`.claude/HEALTH-PLAN.md` until 2026-09-24). The plan is Joel's, written with him before this agent
existed. **Read it before designing or changing a feature** — it is why each rule below exists, and
it is not yours to redo. Where the two ever disagree, this file wins. **Everything in the plan is the
first feature of `health`, not the whole of it** — the name was chosen so a second kind of record
can arrive without the app's name becoming a lie.

---

## What this tool is

**You record what you ate, it tells you the macros, and it keeps the day's running total.** Food
only — exercise was considered and dropped. **The log is the app**; anything else must earn its
screen under the rule below.

## A second screen, and what makes one legitimate

**Approved by Joel on 2026-09-19.** He was asked for a yes or no on this wording and said
*"Yes close out and PR."* **The approval was recorded here by the technical director, not by this
agent** — the amendment asked for that, and Health's session had already ended.

Joel asked for a grocery list on 2026-09-19: *"I want to be able to create a grocery list from
recipes or random items I add. Then I want you to add it to my king soopers shopping cart"*, and
chose the cheap version of it the same day — *"Let's build the cheap version."* He had twice said
the charter would follow: *"Will change you charter later."* **This section is that change**, written
by the agent and approved by Joel unchanged, which is why it reads as settled rather than carrying a
caveat.

**What was wrong with "one screen rather than two."** That clause was written to explain why
exercise was dropped, and it was right about that. What it also did, without anybody deciding it,
was turn a scope decision into a shape rule. **Food only is the scope rule and it still holds.** A
grocery list is food: it is the same foods, one step before they are eaten.

**The rule that replaces it.** The log is the app. Everything else reaches it as a quiet footer
link, never a tab — `/debug` works that way, and so does `/list` until it moves. **A screen earns
its place by being a different moment, not a different noun.** You are not shopping while you are
logging lunch, and you are not logging lunch in the aisle; two moments, two screens, one product.
A second *noun* — exercise — is still out, and this does not reopen it.

**What this does not license.** It is not a general permission to add screens. **A screen added
under this rule still goes to him first**; what changed is that the answer is no longer "the charter
forbids it" before he has been asked.

**The list itself is leaving, and the rule is not.** It moves to the Cookbook with the recipes — you
shop from recipes, not from what you ate — settled 2026-09-20 and sequenced as TEC-15: the
Cookbook's list gets its own URL (TEC-22), then `/list` redirects there and Health stops touching
`health.grocery_items` (TEC-23), then the table is dropped once that is live. **The rule above was
written about the list but is not about the list**, so it stays: it is what the next second-screen
ask gets measured against.

**Recipes are not yours, and that is settled rather than parked.** Joel moved them out on
2026-09-20: they are **their own app, with their own Postgres schema**, themed as a meal cookbook.
**You read them to price a meal; you do not own them.** A recipe book, a generator or a URL import
living in `apps/health` is the wrong answer, and so is a grocery list once TEC-15 lands. **How you
read a recipe is decided** (TEC-11, 2026-09-23): you call Cookbook's `GET /api/servings` from your
server, forwarding the caller's session, and you never read `cookbook` tables. **The contract lives
in Cookbook's charter** — one home, so read it there; changing it is the technical director's call.

---

## Never — these do not bend for a feature

Approved by Joel on 2026-09-17, in full, none struck. A guardrail is something that stays wrong even
when breaking it would make the app better; that is the test each of these passed.

1. **Never write without approval.** The draft is not the log. Approving is the only thing that
   writes.
2. **Never let a failed lookup look like "not found."** A database error surfaces; it never falls
   through to the web. This is Coffee's trap and the one that would quietly undo the whole design —
   nothing on screen changes, the numbers just start drifting again.
3. **Never replace a hand-entered number without keeping the old one.** The correction made by hand
   is the only real ground truth in the system.
4. **Never put real food-log data in the repo.** Fixtures are invented food. The database is the
   right home for what was actually eaten.
5. **Never read or write another tool's schema.** `lib/supabase.ts` pins `health` and that is not a
   default to be overridden per query.
6. **Never estimate when the table already knows.** Database-first is a correctness rule, not a cost
   optimisation — bypass is a deliberate tap and never a default.

**Guardrail 2 and guardrail 6 are the same rule seen from both ends**, and together they are why
this tool is trustworthy. A silent lookup failure degrades the app into internet-first and *nothing
on screen changes* — the numbers simply start drifting again, which is the one thing this design
exists to prevent. Coffee's `LookupError` class solves exactly this; take it wholesale.

---

## The order of lookup, which is the product

**A line naming a Cookbook recipe asks the Cookbook first** (Joel, 2026-09-26, TEC-25), through the
`GET /api/servings` contract in Cookbook's charter, so a Cookbook edit reaches the next log. Its
numbers are not typed over here, on a draft, a day's correction or `/debug`: the fix belongs in the
Cookbook. Everything else runs this order:

1. **Exact match** in your own table — free, instant, no model call.
2. **Near match** on the normalised item name, so it matches parsed names rather than raw dictation.
3. **Miss → outside.** Web search for branded items that publish real numbers; a model estimate for
   "two eggs and toast", where searching buys nothing.
4. **Approval writes it back**, so step 3 runs at most once per distinct food, ever.

**The reason is correctness, not cost** — the plan has it in full.

**A row is a thing that was ordered, not its components.** A Chick-fil-A #1 is one row even though
it is three things in the bag; a #1 and a cookie is two. **The item name carries the whole
specification** — "large fry" and "medium fry" are two remembered items with two sets of numbers.
No components, no modifiers, no per-instance overrides. Wanting precision means saying more words.

**A correction fixes the item and never a past day.** Because the name carries the specification, a
correction means "that item's numbers are wrong", never "I ate less of that". Item numbers are
append-only versions. **An entry snapshots the item's numbers when it is logged, with the item id
and the version it snapshotted**, so a past day's total never moves and a backfill stays possible —
settled by Joel on 2026-09-22 (#116) and approved for building on 2026-09-24. The code catches up
through TEC-21; until it lands, a correction still reaches past days.

---

## Model rules

**A registry, not two strings.** Haiku 4.5 returns a 400 for `output_config.effort` outright and web
tool versions differ between models, so a bare model swap is an error rather than a preference.
`apps/coffee/lib/models.ts` is the shape to follow; your copy is your own, not Coffee's
(`DECISIONS.md`).

**Haiku 4.5 is the default and Sonnet 5 is available. No effort dial** — Sonnet accepts one and
Haiku rejects one, and two models is a clean experiment where two models times five effort levels is
a chore.

**Only the judgment call gets a model choice.** Parsing "a number one from Chick-fil-A" into one item
is a Haiku job at any setting. Coffee puts its toggle on `/api/search`, not `/api/identify` — the
parse is pinned and the estimate is what varies.

**Every number carries its provenance** — your log, the web, or an estimate, and which model produced
it; a Cookbook recipe's numbers carry `cookbook` and name no model, because they are the Cookbook's own. That is not decoration: it says which line to scrutinise, and the debug harness in the plan
depends on it.

---

## What is settled and not yours to reopen

- **It does not appear on the hub's glance.** Joel: *"leave it off for now."* No `/api/summary`, no
  line in `SOURCES`, no request to TechPad Gen. Adding it later is one endpoint and one Linear issue,
  so nothing forecloses it.
- **The livery is borrowed and is TechPad Gen's to settle.** `lib/livery.ts` pins `senna` because
  every livery was taken when this app was scaffolded, and the tracker wears it too. The tracker is
  parked (Joel, 2026-09-24), not retired, so **two apps share a livery until TEC-12 resolves it** —
  do not fix it yourself; it is the theme, and the theme has one owner.
- **The schema is `health`, and its tables are yours.** `20260918140357` and `20260918140405`
  created it and granted it. They were deliberately not pre-empted at standup, because a scaffold
  built before the design is a set of decisions nobody made.

---

## Traps this repo has already paid for

- **A debug route needs no `middleware.ts` edit.** The matcher is a catch-all negative, so any extra
  route is behind the password gate automatically. That matters because `middleware.ts` is gated on
  the technical director and **the debug surface must never need it.**
- **The exposed-schemas list in the Supabase dashboard is outside this repo.** A schema missing from
  it fails as a permissions error that reads like a bad key. `/api/health` probes for it and names it.
