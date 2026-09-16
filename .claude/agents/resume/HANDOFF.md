# Resume Formatter — handoff

State as of 2026-09-16.

Read `RULES.md` first — it was amended today and the change is the headline. This file is only what
is true right now.

---

## What is true now

**The app is becoming a pre-flight check, not a formatter.** Joel approved this on 2026-09-16; the
reasoning and his words are in `RULES.md`. Formatting happens in Word. The app lints the finished
document the way a parser reads it, compares it against the Jobright export so nothing was dropped,
and records the submission.

**Branch `claude/resume-preflight-check` is finished and pushed, and no pull request is open.** It is
additive only: the Check tab now takes both documents and reports what did not arrive, and it is the
landing tab. **Nothing was deleted.** `/api/reformat`, `spec.ts` and `build.ts` still work and the
Reformat tab still renders.

**That split is deliberate and is the safe order** — stop using, prove the new path, then remove —
the same discipline a destructive migration follows. Removal is the next change, not this one.

## Why the renderer is going

Measured against the real fixture on 2026-09-16, not inferred from the design notes:

- **Every render came out A4 from a US Letter template.** `TemplateSpec` has no page-size field and
  `build.ts` sets only `page.margin`, so the `docx` library's own default wins. This alone reflows
  every line and moves the page break.
- Inherited body text renders 10pt where the template's `docDefaults` says 10.5pt.
- The centred Career Highlights block renders left-aligned, its cell shading dropped entirely —
  there is no alignment or shading field anywhere in the spec.
- The bullet glyph and indent are both invented: the template's list is an en dash at 480/240,
  the output a filled circle at a hardcoded 260/200.
- The section rule is drawn under every heading; the template draws three, above.
- `spec.entrySize`, `spacing.before` and `spacing.line` are extracted and **never read by the
  builder** — dead fields that read as supported.

**The constants that do match were fitted to one file.** `CCCCCC` and the 9360 tab stop are this
template's own values, hardcoded. That is why it looked close and why it drifts the moment the
template changes.

**No version of this engine, in any commit, has ever read the template's XML.** It always
synthesised a new document from a scalar summary. That is the root cause, not any one of the above.

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
