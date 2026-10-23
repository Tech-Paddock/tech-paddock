import type { AtsFinding } from "@/lib/docx/ats";
import type { ChangeAction } from "@/lib/reskin/types";

/**
 * What the messages mean: the guide in the Diagnostics rail (TEC-134).
 *
 * UI copy, not render text — nothing here reaches a document. It sits next to
 * `lib/verdict.ts` so the two move together, and it is keyed the way the
 * verdict is: by change-log `action`, finding `severity` and coverage, never by
 * the prose of a message. `tests/message-guide.test.ts` runs the verdict on
 * each category and fails when the verdict gains one the guide does not
 * explain, or when an entry says "fails" about something that is only a note.
 *
 * `reads` is a phrase the owner will recognise from the screen. For verdict
 * entries the test checks it still occurs in what `verdictFor` says.
 */

/** What a message does to the reformat. */
export type GuideEffect = "fails" | "note" | "none" | "no-verdict" | "mixed";

export type GuideEntry = {
  key: string;
  title: string;
  effect: GuideEffect;
  /** A phrase from the message as it appears on screen. */
  reads: string;
  /** Where it shows up. */
  where: string;
  means: string;
  causes?: string[];
  check: string;
};

export const EFFECT_LABEL: Record<GuideEffect, string> = {
  fails: "Fails it",
  note: "Note only",
  none: "No effect",
  "no-verdict": "No verdict",
  mixed: "Blocking fails",
};

/** Reasons and notes the verdict gives, one entry per verdict category. */
export const VERDICT_GUIDE: GuideEntry[] = [
  {
    key: "missing",
    title: "Lines that reached no part of the document",
    effect: "fails",
    reads: "of the source reached no part of the document",
    where: "The verdict, and each line under Not carried across.",
    means:
      "Text from the Jobright export is not anywhere in the finished resume. This is the loss the app exists to catch, so no file is handed out.",
    causes: [
      "The template has no slot for that line in a section other than Professional Experience.",
      "The template is missing the section the line belongs to.",
    ],
    check:
      "Open Not carried across. Each line names its section and why it was not placed. Fix the template so the section has room for it, then reformat again.",
  },
  {
    key: "blocking",
    title: "Blocking ATS finding",
    effect: "fails",
    reads: "Blocking ·",
    where: "The verdict, and the ATS check panel.",
    means:
      "Something in the output would stop a résumé parser reading it properly: a second table, a text box, a content control, or contact details in a header.",
    check:
      "The output is your template with new text, so the cause is in the template. Fix it there and every later render is fixed too.",
  },
  {
    key: "input-dropped",
    title: "Entries that had nowhere to go",
    effect: "fails",
    reads: "had nowhere to go in the template",
    where: "The verdict, and the Had nowhere to go panel.",
    means: "A whole section of the export has no matching section in the template, so none of it was carried over.",
    check: "Add that section's heading to the template, or remove the section from the export if you do not want it.",
  },
  {
    key: "section-partly",
    title: "A section filled only in part",
    effect: "fails",
    reads: "only in part",
    where: "The verdict.",
    means:
      "The export filled some of a section's slots but not all of them, so the rest still hold the template's own words, such as its sample figures in Career Highlights.",
    check:
      "Give the export one item per slot, or remove the extra slots from the template. Shipping the template's sample text is why this fails.",
  },
  {
    key: "section-empty",
    title: "A section the source left empty",
    effect: "note",
    reads: "which keeps its own text",
    where: "The verdict's notes.",
    means:
      "The export had nothing for a whole section, often the Summary, so the template's version of that section was kept as it is.",
    check: "Read that section in the download. If the template's text suits this job, nothing to do.",
  },
  {
    key: "template-trimmed",
    title: "Template lines left out",
    effect: "note",
    reads: "with no counterpart in the source",
    where: "The verdict's notes, and What it did to the template.",
    means:
      "The template had more lines than the export, so the extras were dropped. Nothing from the export is lost.",
    causes: [
      "In Professional Experience: a job in the template has more bullets than that job in the export.",
      "In Professional Experience: the template has more jobs than the export.",
      "In Professional Experience: blank lines between jobs in the template. Spacing comes from each job's own paragraph spacing instead.",
      "In other sections: more rows or items in the template than in the export.",
    ],
    check:
      "Open What it did to the template and look for template-trimmed: it says which bullet, job or blank line went. Usually nothing to fix.",
  },
  {
    key: "input-not-read",
    title: "Part of the source could not be read",
    effect: "note",
    reads: "could not be read",
    where: "The verdict's notes, and the Not read, not placed panel.",
    means:
      "Career Highlights in the export did not pair up as one metric and one description, so they were skipped rather than guessed at and the template's were kept. They repeat items from the body, so nothing unique is lost.",
    check: "If you want them carried over, make each highlight one metric and one description in the export.",
  },
  {
    key: "feathered",
    title: "Experience lines feathered in",
    effect: "note",
    reads: "feathered in",
    where: "The verdict's notes, and What it did to the template.",
    means:
      "A line in a job had no slot in the template, so it was added where the export has it, formatted like the nearest template bullet. The text arrived.",
    check: "Look at that job in the download to make sure the added line looks right.",
  },
  {
    key: "warning",
    title: "ATS warning",
    effect: "note",
    reads: "Warning ·",
    where: "The verdict's notes, and the ATS check panel.",
    means:
      "Something a parser may stumble on, such as an image used as a line or a heading it may not recognise. It is true of the template, so it never fails a reformat.",
    check: "Fix it in the template when convenient.",
  },
];

/** The Diagnostics panels a person reads, beyond the verdict itself. */
export const PANEL_GUIDE: GuideEntry[] = [
  {
    key: "not-carried-across",
    title: "Not carried across",
    effect: "fails",
    reads: "Not carried across",
    where: "Diagnostics, under This render. Nothing dropped is the same check on any other document.",
    means: "Each line of the export that is not in the finished document, with its section and the reason it was not placed.",
    check: "Read the reason. It almost always points at the template's section having no room for the line.",
  },
  {
    key: "ats-check",
    title: "ATS findings",
    effect: "mixed",
    reads: "ATS check",
    where: "Diagnostics, for this render and for any document you drop in.",
    means:
      "A lint of the document as a parser reads it. Blocking findings fail a reformat; warnings are notes. Zero means nothing structural was found.",
    check: "A finding on a render is about the template. Fix it there.",
  },
  {
    key: "no-verdict",
    title: "Not recorded · NO VERDICT",
    effect: "no-verdict",
    reads: "NO VERDICT",
    where: "Reformat and Diagnostics, on a render reopened from Resumes.",
    means:
      "The saved render is missing what the check needs, usually because it was made before that was recorded. Rather than say PASS about something it cannot check, the app says nothing.",
    check: "Reformat the same export again to get a verdict. The old file is unchanged.",
  },
];

/** Change-log actions that never vote, as listed in What it did to the template. */
export const CHANGE_LOG_GUIDE: GuideEntry[] = [
  {
    key: "replaced",
    title: "replaced",
    effect: "none",
    reads: "replaced",
    where: "What it did to the template.",
    means: "A template line now holds the export's text.",
    check: "Nothing.",
  },
  {
    key: "cloned-overflow",
    title: "cloned-overflow",
    effect: "none",
    reads: "cloned-overflow",
    where: "What it did to the template.",
    means: "The export had more items than the template, so the template's last one was copied to hold the extra.",
    check: "Nothing.",
  },
  {
    key: "kept-unchanged",
    title: "kept-unchanged",
    effect: "none",
    reads: "kept-unchanged",
    where: "What it did to the template.",
    means:
      "Part of the template was left as it is: it already matched the export, the export had none, or the template's layout could not be read. Its detail says which.",
    check: "Nothing, unless its detail says the export's text had nowhere to go. Then fix the template.",
  },
  {
    key: "passthrough",
    title: "passthrough",
    effect: "none",
    reads: "passthrough",
    where: "What it did to the template.",
    means: "Education, Certifications, Hobbies and the name and contact block come from the template untouched.",
    check: "Edit those sections in the template.",
  },
];

export function guideEntry(key: string): GuideEntry {
  const e = [...VERDICT_GUIDE, ...PANEL_GUIDE, ...CHANGE_LOG_GUIDE].find((g) => g.key === key);
  if (!e) throw new Error(`No guide entry ${key}`);
  return e;
}

/**
 * The entry for each change-log action, on its own. A `Record`, so a new
 * action fails the typecheck until it is explained. `not-found-in-input` alone
 * is a wholly empty section; beside an entry that wrote source text into the
 * same section it is `section-partly`.
 */
export const ACTION_GUIDE: Record<ChangeAction, string> = {
  replaced: "replaced",
  "kept-unchanged": "kept-unchanged",
  "cloned-overflow": "cloned-overflow",
  "template-trimmed": "template-trimmed",
  "input-dropped": "input-dropped",
  "input-not-read": "input-not-read",
  "not-found-in-input": "section-empty",
  passthrough: "passthrough",
  feathered: "feathered",
};

/** The entry for each finding severity. */
export const SEVERITY_GUIDE: Record<AtsFinding["severity"], string> = {
  blocking: "blocking",
  warning: "warning",
};
