# Health — notes

## State

- The macro log is live on Next.js 16: dictate, approve the draft, the day's total updates.
- Every model call (the parse and the estimate) is Claude Sonnet 5.5 at effort `medium`, set once
  in `lib/models.ts` (TEC-133). No picker, no effort dial; the `/debug` comparison is gone.
- The gate file is `proxy.ts` (Node runtime), the base copy with the function renamed.

## How it works

- **Lookup** (`lib/log.ts:resolveItem`): Cookbook recipe, then exact match on the normalised name,
  then one model call. Approval writes it back.
- **Versions**: `health.items` is identity; `health.item_versions` holds the numbers over time.
  `lib/items.ts:resolveVersion` takes the era with the greatest `effective_from` on or before the
  date, then the newest row in it.
- **Snapshots**: `entry_items` carries the four macros and a NOT NULL `item_version_id`. `readDay`
  is a plain sum; a line without a snapshot is a `LookupError`, never zero. A version's `kind`
  (`correction` or `change`) is for a future backfill; none exists.
- **Dates** are the phone's, always sent. The page re-reads "today" on return to view and at every
  parse.
- **After a save** (`lib/saved.ts`) the page re-reads today and looks for the saved entry; missing,
  unreadable or filed under another day is stated in words.
- **Web provenance** (`lib/webEvidence.ts`): a cited URL is kept only if that run's own search or
  fetch results contain it.
- **Models** (`lib/models.ts`): `requestBase()` is spread into every `messages.create` and is the
  only place a model or effort is set; `tests/models.test.ts` pins the request shape and walks the
  source for any other. Thinking stays adaptive; nothing is prefilled; `tool_choice` is the
  default. A stop other than `end_turn`/`stop_sequence` (including `refusal`) fails the line, and
  there is no fallback model. Past rows keep the model they recorded; `modelLabel` still names
  Haiku 4.5 and Sonnet 5 for them.
- **Approve** (`lib/approve.ts:decideLine`) decides every line before writing. A number is `hand`
  only when the line says it was typed over. An untyped difference, a stale `item_id`, a failed
  line or a duplicate food is a 409 and nothing is written. A renamed line re-resolves through
  `/api/resolve` on blur; same-name lines from one dictation merge first.
- **Targets** (`lib/targets.ts`, migration `health_targets`): append-only and dated, grams only,
  calories = 4p + 4c + 9f, `locked` stored. `targetFor` takes the greatest `effective_from` on or
  before the day, with no fallback. A new target applies from the phone's today; the server
  refuses a date more than a day from UTC's. A target, none (`{ target: null }`) and a failed read
  (503, shown as an error; `/targets` then offers no form) stay distinct. "Left today" is signed;
  the clamp at zero belongs to the `/targets` split (`setCalories`, `setMacro`).
- **Deleting a meal** (`lib/entries.ts`) is a hard delete until TEC-165: it cascades to its lines;
  items and versions stay.
- **Cookbook** (`lib/cookbook.ts`): `/list` redirects to Cookbook's list. A food whose normalised
  name equals a recipe's is the Cookbook's. `GET /api/servings` is read once per request,
  forwarding only `paddock_session` to `COOKBOOK_BASE_URL`. Approving re-reads it, refuses a draft
  whose numbers moved, and appends a `cookbook` version (kind `change`) only when they differ. A
  typed-over recipe number is refused everywhere. Same-name recipes are refused, never guessed.

## Traps

- `lib/supabase.ts` sends `cache: "no-store"`; keep it. On Next 14 a GET-only route served its
  first read all day.
- Turbopack refuses an ICO whose PNG frame is not RGBA.
- Next 16 drops `apple-mobile-web-app-capable` unless `metadata.other` in `app/layout.tsx` writes it.
- An unreadable Cookbook fails only lines stored with a `cookbook` version; a recipe never logged
  here falls through. A `SESSION_SECRET` mismatch looks exactly like an outage.
- `normalizeName` is the item key (folds accents, apostrophes, simple plurals). Changing it once
  `health.items` has rows splits foods and needs a re-keying migration.
- `lib/models.ts` started as a flagged copy of Coffee's. Coffee, Cookbook and Health each keep
  their own, and they differ; none is stamped.
- `max_tokens` covers adaptive thinking as well as the JSON (parse 8192, estimate 16000). Lowering
  it toward the JSON's size turns a thinking turn into a `max_tokens` failure.
- A refusal fails the line by design: no `fallbacks`, no second model (owner, 2026-10-22: "No
  fallback, fail visibly"). Adding one would stamp a number with a model that did not make it.
- `health.comparisons` stays in the schema, unused since TEC-133. Whether to drop it is open in
  TEC-162.
- Every livery maps `--sev-warn` onto the accent, so over-target uses `--danger` locally
  (`app/LeftToday.tsx`).
- `eaten_at` is never set by the app and duplicates `created_at`; a day's total reads `eaten_on`.
