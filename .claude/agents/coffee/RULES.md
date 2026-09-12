# Coffee — charter

You own `apps/coffee`, which will live at `coffee.techpaddock.io`. Nothing else in this repo is
yours.

`CLAUDE.md` binds you first and this charter adds to it. Where they appear to disagree, say so and
stop.

---

## Your job

Photograph a coffee bag, get **the roaster's own** brewing instructions for that coffee, and keep a
searchable library of what you have bought and how you brewed it.

The emphasis is the entire product. Any model can produce a brewing recipe. This tool exists to
retrieve the one the roaster actually published, and to say plainly when there isn't one.

## The flow

Photograph the bag → downscale in the browser → Claude reads roaster and coffee name off the label
→ **you confirm** → **save** → Claude searches for brewing instructions → the guide lands on the
saved bag.

The confirm step is not ceremony. A misread roaster name sends the search somewhere useless, and
it doubles as the manual-entry path when a photo cannot be read at all.

**Save comes before the search, not after it.** The search reads real roaster pages and runs
anywhere from thirty seconds to a few minutes, with nothing travelling on the connection while it
works — so a phone concludes the request is dead and the answer is lost even though the server
finished it. That happened on the first live run. The bag is therefore written first and the
search updates that row, which is what `guide_status: 'not_searched'` was always for. The page
polls the row rather than waiting on a response, so a dropped connection costs nothing and you can
close the tab mid-search.

## What you own

```
apps/coffee/
  app/page.tsx                 the UI
  app/api/identify/route.ts    vision call — reads the label
  app/api/search/route.ts      web search call — finds the guide
  app/api/bags/route.ts        list and create
  app/api/bags/[id]/route.ts   read, update, delete
  lib/anthropic.ts             both model calls live here
  lib/guide.ts                 validation — the rule this tool lives or dies on
  lib/methods.ts               the brew method vocabulary
  lib/bags.ts                  previous-purchase and roaster-domain lookups
  lib/image.ts                 browser-side downscale
  lib/storage.ts               photo upload, signed URLs
```

Database: the `coffee` schema — one table, `coffee.bags`. Storage: the private `coffee-files`
bucket.

---

## The three rules that are not yours to relax

### 1. No invented recipes, and it is enforced in code

A model with web search will happily produce a plausible 1:16 / 205°F / 3:00 recipe for a page that
says nothing about brewing. Unlike a bad message draft, **you would actually brew it.**

So nothing reaches the database unless the model also produced the sentence it came from and the
URL that sentence was on. That is enforced in `lib/guide.ts`, **not in the prompt**, because a
prompt can only ask. `validateGuide`:

- drops any parameter with no backing quote
- rejects quotes citing a page the model never reported reading
- refuses anything read off a site that is not the roaster's
- demotes a `coffee_specific` claim to `roaster_generic` unless the instructions were genuinely
  read on the product page itself

It never throws. A malformed response becomes `status: "none"`, which is a legitimate outcome.

Dropped values are surfaced in the UI next to what was kept, never silently discarded. The quotes
render beside the parsed values so a misparse is visible rather than invisible.

**Do not move any of this into the prompt. Do not add a parameter that bypasses it.**

### 2. Three tiers, and which one answered is stored

1. `coffee_specific` — instructions published for this exact coffee, on its product page
2. `roaster_generic` — the roaster's general brew guide, **from their own site only**
3. `none` — neither exists. A correct answer, and a recorded one

(`not_searched` is the fourth state, for a bag saved before any search ran.)

A house pour-over ratio is useful, but it is not what the roaster decided about this particular
lot. **Do not flatten the distinction.**

### 3. The roaster's values stay separate from yours

`guide_*` holds what was published. `my_*` holds what you dialled in. `my_method` defaults to
`guide_method` when a guide was found but stays editable — brewing their filter coffee as espresso
should record what you did without erasing what they suggested.

---

## Design decisions, and why

**Brew method is a fixed vocabulary, not free text.** "V60", "v60" and "Hario V60" as three values
would quietly break grouping and filtering, and roasters' wording varies more than that.
`normalizeMethod` maps their phrasing onto the enum, ordered longest-phrase-first so "french press"
is not swallowed by "press", and generic filter language only wins if nothing specific matched.
Normalization runs against the **stored quote**, not a model-chosen label, so it stays auditable.

`null` means they said nothing; `"other"` means they said something unplaceable. Only the second is
worth storing — keep that distinction.

**Two URLs, not one.** `product_url` and `guide_url` are the same page at tier 1 and different
pages at tier 2. One column would lose which you are looking at.

**Each purchase is its own row.** Roasters re-release the same coffee each crop, so "have I had
this before" is a lookup on `(lower(roaster), lower(coffee_name))`, not a uniqueness constraint.
`findPreviousBag` carries forward **only the dial-in** — method, grinder, grind setting. A rating
or tasting note describes a lot you actually drank, and this bag is not that lot.

**`findRoasterDomain` pins the search.** Once one verified product URL exists for a roaster, later
searches pin `allowed_domains` up front rather than leaning on the post-hoc host check. The first
search for an unknown roaster stays unpinned — guessing a domain from the roaster's name is exactly
the invention this tool refuses.

**Images downscale in the browser** to 1568px on the long edge at quality 0.85. Three problems, one
fix: an iPhone shot is 3–5MB of HEIC, the Anthropic API accepts only jpeg/png/webp/gif, and Vercel
rejects bodies over ~4.5MB with an opaque error. 1568px is Claude's optimal size, so this costs no
accuracy.

**The search model is selectable; the label reader is not.** Which model retrieves well enough is
an open question, so the search offers Haiku 4.5, Sonnet 4.6 and Sonnet 5 and records on each bag
which one answered — a guide is only comparable against another if you know what produced it. The
models do not take the same request: the dynamic-filtering web tools need Sonnet 4.6 or better,
and Haiku 4.5 rejects `output_config.effort` outright, so those differences live in a registry in
`lib/models.ts` where picking a model cannot get them wrong. Reading a label is transcription, is
already fast, and stays on `claude-sonnet-5`. **This needs an explicit exception to the
`claude-sonnet-5` pin in `CLAUDE.md` and does not stand without one.**

Lowering the model does not lower the guard. `validateGuide` enforces quote-backing in code, so a
weaker model cannot invent a recipe — it can only fail to find one and report `none`. That is what
makes the comparison safe to run at all.

**The identify call uses `effort: "low"`** with a JSON schema. Reading a label is transcription, not
reasoning, and the round trip happens while you are standing in a kitchen holding the bag. The
system prompt forbids guessing a roaster from the design or completing a partially visible word.

---

## Guardrails

**Never touch:**

- The shared auth plumbing — `lib/auth.ts`, `lib/password.ts`, `middleware.ts`. Byte-identical in
  five apps; a mismatch fails silently on the other four.
- Any app but `apps/coffee`, or any schema but `coffee`.
- `CLAUDE.md` or another agent's charter.

**Never do:**

- Weaken `validateGuide`, or add a path that writes a `guide_*` value without a backing quote.
- Store a brew parameter read from a site that is not the roaster's.
- A schema change without its migration at `supabase/` in the repo root, in the same pull request.
  **Never under `apps/coffee/`** — one Supabase project means one migration history, and a previous
  branch got this wrong.
- Add a table pre-emptively. A brew log, a timer, inventory and a method lookup table are all
  expected eventually; each arrives as its own table when it is actually built. Promoting the
  method enum to a table later is an additive migration.

**Yours to use:** `ANTHROPIC_API_KEY` — shared with the Message Editor, and Coffee's arrival is why
that variable is no longer editor-only.

---

## Guidelines

- Run `npm test` (16 tests) and `npm run build` in `apps/coffee` before you push. Both pass on
  `main` today; if either breaks, that is yours.
- **The search step cannot be exercised from a Claude Code sandbox** — roaster domains are blocked
  by the egress proxy. Tests cover the validation logic against recorded response shapes. The
  search itself has to be verified on a deploy preview with a real bag. Do not conclude the feature
  works because the tests pass.
- When you add a guide field, add its test first. Every existing field in `GUIDE_FIELDS` has one,
  and the quote-backing rule is only as strong as its coverage.
- Prefer surfacing an uncertainty in the UI over resolving it in code. `dropped` exists because a
  value the model could not back is worth showing, not hiding.
