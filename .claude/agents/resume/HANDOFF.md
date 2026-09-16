# Resume Formatter — handoff

State as of 2026-09-16.

Read `RULES.md` first. This file is only what is true right now.

---

## What is true now

**Everything is merged and live.** The re-extract fix landed as #71, the colour work as #67, the
template lifecycle as #56. `resume.techpaddock.io` serves current `main`, and `npm test` is green.
**Count the suite by running it, never by grepping** — `grep -c "it("` counts `describe` lines too
and reads high, which is how this app's size was documented at half its real value for a week.

**The template file is what renders, not the `spec` column.** `/api/reformat` downloads the
template's stored `.docx` and runs `extractSpec` on it. This is the section to read before touching
anything about how formatting is resolved.

- **A render's formatting is derived from the file plus the code that reads it**, so two renders from
  the same template row at different times can legitimately differ. `renders.template_snapshot` is
  what keeps each one auditable.
- **The `spec` column is now a cache and a fallback, not the source of truth.** The Templates tab
  says "as uploaded" for that reason.
- **`extractSpec` runs on every saved render**, so a bug in it is a render-time failure. It must stay
  total: never throw on a `.docx` that reads.
- **The fallback is deliberate and never silent.** If the download fails or the bytes are unreadable,
  the render falls back to the stored spec and succeeds — but the response carries `specSource` and
  `specNote`, and the Reformat tab prints them. **If you ever make that fallback quiet, you have
  reintroduced the bug this change exists to kill.** Only `StorageError` and `DocxReadError` are
  caught; anything else is still the 500 it should be, and a test pins that.

**What this does not remove.** It ends re-uploading a template to pick up a *code* change. It does
nothing about a change to the *template itself* — if the active row points at an older `.docx`, that
is what renders. #67's outstanding re-upload still stands for that reason, and it is in the ledger.

## Traps specific to this app

- **Content is not always a direct child of `<w:body>`.** Walk the tree or whole sections read as
  empty. There is a named regression test.
- **A template may keep the name and contact in `word/header1.xml`** — both current ones do. Spec
  extraction ranks body prose sizes, so a name outside the body shifts every rank and the render
  comes out with no hierarchy. `extractSpec` takes those sizes from the header when it finds them.
  A `w:type="first"` header with no `<w:titlePg/>` **is not displayed by Word at all**, so it reads
  as absent while being fully present in the archive.
- **`extractSpec` starts from `normalizeSpec(null)`, never `{ ...DEFAULT_SPEC }`.** A spread shares
  the nested objects, so in a long-lived server process every later template inherited whatever the
  last one measured. A test pins this; do not swap it back.
- **A link's colour is the link's.** `dominantColor` weighs non-link text by how much of the line it
  covers rather than by run count, because Word splits runs mid-word for spellcheck and that split
  must not get a vote.
- **The coverage report must not be able to lie.** It did once — a bullet before the first employer
  line was discarded while still counted as placed. The coverage claim is the whole design.
- **Every new fixture is a place a real name can hide.** For a `.docx` that means `.rels` and
  `docProps/`, not just `document.xml`. A real company name has been scrubbed out of this app once.

## In flight

Nothing.

## Next

1. **Run real generated output through a free ATS checker.** Still the highest-value open item:
   every check here verifies the app does what it was designed to do, and none verifies the design
   was right. Doing it with a real resume uploads Joel's personal data to a third party, which is
   his decision alone — a synthetic document exercises the structure without that.
2. **Link a render to a shared contact.** Open since the rebuild.
3. **Decide whether `/api/health` should be reachable by an external monitor.** TD and Platform as
   much as you.
4. **Watch version numbering now deletion exists** — `version` is max+1 across all rows including
   archived, so deleting the newest means the next upload reuses that number. Harmless today; reads
   as a bug later. See `.claude/DECISIONS.md`.

**Asked and not taken up, twice — do not keep re-asking.** Whether the contact line should be grey
or accent. The template hyperlinks the email and LinkedIn in accent and sets the phone grey; the
output renders that line as one run and picks grey. It stays until Joel says otherwise.
