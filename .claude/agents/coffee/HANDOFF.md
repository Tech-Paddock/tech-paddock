# Coffee — handoff

State as of 2026-09-22. Read `RULES.md` first; this file is only what is true right now.

---

## What is true now

**It is live at `coffee.techpaddock.io`**, behind the password gate, installed to the iPhone home
screen. The whole flow has run end to end against a real bag.

**Save comes before the search**, and the page polls the row rather than waiting: the search takes
minutes with nothing on the connection, so a phone calls it dead. Two answers were lost that way.
**It can be run again from the shelf**, and that refreshes the link too.

### What changed on 2026-09-22

**Re-search reads the product URL already on the row**, named in the message because that is what
makes it fetchable. A link the roaster has since moved costs one fetch and then searches as normal,
so a stale link never becomes a dead end the bag cannot recover from.

**Nothing is pinned up front.** `findRoasterDomain` is gone and no search sets `allowed_domains`.
Pinning narrowed the only channel by which a page can enter the conversation — `web_fetch` reaches
nothing search surfaced — and the rows measure it: Sweet Bloom unpinned came back tier 1 with four
quotes, Sweet Bloom pinned came back `none`, no code change between them. **`validateGuide`'s host
check is untouched and is now the whole constraint**, which is what it was for every first search
this app has ever run.

**A search that failed is no longer stored as one that found nothing.** Web search and web fetch do
not raise — a failure is a result block carrying an `error_code` inside an HTTP 200, and reading only
the text blocks turned that into a confident `none` about the roaster. Running out of resume turns
did the same, an empty string parsing to `{}`. **`lib/searchRun.ts` holds the rule**, pure and apart
from the SDK so it has tests: a `none` reached past a failed tool is refused and written to
`guide_search_error`, which the page already shows; a run that found something stands regardless.

### Settled elsewhere

The suggestion, the comparison harness, the bag/brew split, the measurement rules and `openingBrew`
are in `RULES.md` and are deliberately not restated here. **None of them changed this session.**

## Traps specific to this app

- **An empty result and an unread result must not render the same.** **Five times now** — the fifth
  was the search itself, fixed above. **Adding a read path here? Check this first.**
- **A bag needs a purchase date, and the error names it.** That empty field sent `{}` and the page
  said "Couldn't save that bag" about a bag saved minutes earlier. `lib/patch.ts` holds both halves.
- **Neither model call can be exercised from a Claude Code sandbox** — roaster domains are blocked by
  the egress proxy and the suggestion needs a real key. **Do not conclude either works because the
  tests pass.**
- **`product_url` is stored having never been read**, on a `none` as much as on a hit — never
  quote-backed, never host-checked, and `Beans ↗` links it straight out. Maria Gutierrez holds
  `/products/maria-gutierrez` where Sweet Bloom's verified shape is `/product/…-3/`. **Open, and
  Joel's**: he accepted a link failing because a roaster moved it, which is not one we invented.
- **Two brewer vocabularies, and `myBrewerFor` crosses only on an exact match.** A bare "V60" does
  not map: two are on the shelf and the roaster did not say which. Rounding is the same invention.
- **A date input on iOS sets its own minimum width**, turned off in `globals.css`.
- **The icon is a pour-over in the JPS livery**, every colour a token, **no alpha**. **A static
  import**, from `/_next/static` — the one prefix middleware excludes.
- **"Beans ↗" is a *sibling* of the expand toggle, never nested** — an `<a>` in a `<button>` is
  invalid markup and browsers disagree about what a tap does.
- **`guide_status` records where instructions were read, not who they were written for**, so nothing
  ranks or filters on tier 1. **The Sweet Bloom example `RULES.md` gives for it is wrong** — Next 1.

## In flight

**`claude/coffee-search-reads-the-product-page`** — the 2026-09-22 change above. Suite and build
pass, drift clean, no migration, nothing shared touched. **No pull request until Joel asks.** Nothing
else of mine is open; the branches this file used to list are merged and off the remote.

## Next

1. **`RULES.md` §2 is wrong about Sweet Bloom, and our own data says so.** It has them printing one
   house recipe — "1:17, 900µm, 2:40" — on every product page, and builds the tier-1 caveat on that.
   The Jhonny Alvarado row we actually retrieved reads 18g / 305g / **850µm / 23-25s**. Joel,
   2026-09-22: *"Sweetbloom dials their recipes for all their beans."* **A charter is not this
   agent's to edit** — the TD drafts and Joel approves. Proposed, not made.
2. **The unpinned search has never run against a real bag.** Maria Gutierrez is the test: it went
   `none` while pinned, and the roaster publishes a recipe for it.
3. **Still open**: one coffee twice, Haiku then Sonnet 5 at `high`, compare the tiers. The
   suggestion has still never run against a real bag.
