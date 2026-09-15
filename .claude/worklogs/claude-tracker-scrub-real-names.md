# claude-tracker-scrub-real-names
agent: technical director · apps: tracker · shared files: none
authorized by: Joel, directly, in session — "3 scrb/change the personal data"

## 2026-09-15 00:35 — claim
Working on: replacing real people and real companies with synthetic names in `apps/tracker`.
Touching: `lib/matchMeetings.ts`, `tests/matchMeetings.test.ts`, `tests/signals.test.ts`.
Depends on: nothing. No schema, no shared files, no auth plumbing.

## 2026-09-15 00:35 — this was supposed to be a history problem and it is not

The history scrub sent me looking for strings removed from the working tree. Enumerating them
properly — every blob that has ever existed, not a sample — turned up **seven real entities still
live on `main`**: five companies and two people, across three files in `apps/tracker`. One of the
two people is a full name recorded with their employer and preferred contact channel, which is a
contact record rather than a passing mention.

**So the live half was never clean, and I have said twice that it was.** The audit checked emails
exhaustively and proper nouns not at all; the follow-up looked at history and treated the working
tree as already settled. The finding is not that a scrubbing tool missed something — nothing had
ever looked.

It also answers a question that had been sitting open for two days. `Litware Growth LLC` in a tracker
test is **real**: it appears on the seed-contacts line in `CLAUDE.md`'s history alongside four other
companies and the two people. That line is the origin of all of it.

## 2026-09-15 00:35 — derived values are the trap, and I still half-fell in it

A name in a test is rarely only a name. It has derivatives, and a replacement that misses one leaves
the test asserting a relationship that no longer holds:

- `slugify("Contoso Cloud")` is asserted to equal `"contosocloud"`. The slug is a separate string
  literal; replacing only the input makes the expectation false.
- The same for `"Tailspin, Inc."` → `"tailspin"` and `"Litware Growth LLC"` → `"litwaregrowth"`.
- A comment in `lib/matchMeetings.ts` carries a real email domain.

I mapped the slugs and the domain and **still missed one**: `recruiter@proseware.example`, lowercase,
where the map only carried the capitalised company. The company became `Proseware`, the domain
stayed `proseware`, the domain-match stopped firing and the ambiguity test went red. **Caught by running
the suite, which is the only reason this entry is a note rather than a merged bug.** A scrub that had
been eyeballed would have shipped it.

Names follow `#21`'s precedent — that scrub used `Northwind`, so this one stays in the same family
of unmistakable placeholders: `Fabrikam`, `Contoso Cloud`, `Litware Growth`, `Tailspin`, `Proseware`,
and `Dana Whitfield` / `Robin Marsh` for the two people. Distinct from `Northwind` on purpose, so two
different real companies do not collapse into one synthetic one across apps.

## 2026-09-15 00:35 — handoff
Landed on the branch, no pull request: 34 replacements across three tracker files. **38 tests pass
and `npm run build` is clean**, both re-run after the fix rather than before it. A repo-wide sweep
finds none of the seven remaining in any `.ts`, `.tsx`, `.md` or `.sql`.
Open: **the history half is untouched and still needs Joel** — his clicks on *Block force pushes* and
*Restrict deletions*, and `git-filter-repo` run with him present. This branch fixes what is live; it
does not touch what is in old commits.
Note for Pipeline Tracker: this is your app and I edited it. It was live personal data, which the
brief gates to the TD, and there was no tracker session running. The test fixtures now read
`Fabrikam` and `Robin Marsh`; nothing about the matching logic changed.
