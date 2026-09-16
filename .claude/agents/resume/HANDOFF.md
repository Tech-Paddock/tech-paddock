# Resume Formatter — handoff

State as of 2026-09-16.

Read `RULES.md` first — it was amended today and the change is the headline. This file is only what
is true right now.

---

## What is true now

**The app is a pre-flight check, not a formatter.** Joel approved this on 2026-09-16; the reasoning
and his words are in `RULES.md`. Formatting happens in Word. The app lints the finished document the
way a parser reads it, compares it against the Jobright export so nothing was dropped, and records
the submission.

**#81 is merged and live.** `tp-resume`'s production deployment carries it — confirmed against the
deployment record, not assumed from the merge. The Check tab takes both documents, reports what did
not arrive, and is the landing tab.

**Nothing was deleted, and that is the half still to do.** `/api/reformat`, `spec.ts`, `build.ts` and
the Reformat tab all still work and still ship. The split is the safe order — stop using, prove,
then remove — the same discipline a destructive migration follows. **Removal is the next change**,
and it is blocked on one decision rather than on effort: see Next.

**In flight: nothing.**

## Why the renderer is going

**`RULES.md` carries the measured defect list** — the A4 page, the 10pt/10.5pt body, the dropped
centring and shading, the invented bullet, the misplaced rule, the three dead spec fields. It is not
repeated here; a second copy is a copy that drifts.

**The one thing worth carrying in both places is the root cause**, because every one of those
defects is a symptom of it and a fix aimed at a symptom will not hold: **no version of this engine,
in any commit, has ever read the template's XML.** It always synthesised a new document from a
scalar summary and hardcoded the geometry. The constants that *do* match were fitted to one file.

## Traps specific to this app

- **The header trap is the reason the app still exists.** Both current templates keep the name and
  contact in `word/header1.xml`, and a `w:type="first"` header with no `<w:titlePg/>` **is not
  displayed by Word at all** — so editing in Word can ship a resume whose contact block no parser
  reads, with nothing on screen to show it. `auditAts` raises it as blocking.
- **`tests/fixtures/template-sample.docx` is scrubbed in a way that hides a bug.** The scrubber
  collapsed each paragraph's text into its first run, so `isEntryLine` matches **nothing** in it and
  the whole employer/title/dates measurement path is untested. Green tests do not cover it.
- **Content is not always a direct child of `<w:body>`.** Walk the tree or whole sections read as
  empty. There is a named regression test.
- **`extractSpec` starts from `normalizeSpec(null)`, never `{ ...DEFAULT_SPEC }`.** A spread shares
  the nested objects, so every later template inherited the last one's measurements.
- **The content check must not overstate or cry wolf**, and both are the same rule. See `RULES.md`;
  both failure modes have named tests.
- **Every new fixture is a place a real name can hide** — `.rels` and `docProps/`, not just
  `document.xml`.

## Next

1. **Remove the renderer** — `/api/reformat`, `spec.ts`, `build.ts`, the Reformat tab. Needs a
   decision on what happens to `renders.template_id`, which is `NOT NULL`: that is a destructive
   schema change and splits into two pull requests.
2. **Persist a check** the way renders are persisted, so the pre-flight result is part of the
   application record rather than a screen you close.
3. **Regenerate `template-sample.docx`** so runs survive the scrub.
4. **Run real output through a free ATS checker.** Still unverified externally.

**I am at a compaction point.** The branch is pushed and the charter and this file describe it; none
of the above lives only in the session.
