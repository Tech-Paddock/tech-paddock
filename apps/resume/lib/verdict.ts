/**
 * Pass or fail for one reformat, and why.
 *
 * Any irregularity in a reformat fails it, with a reason (2026-09-19). It is the
 * one judgement allowed on the Reformat tab, which otherwise carries no readouts
 * at all. A
 * verdict is not telemetry: a document you are about to send either came
 * through intact or it did not, and that is a yes or no rather than a number.
 *
 * **It fails on what happened to this reformat, not on what is wrong with the
 * template.** An ATS warning about a second table fails every render
 * identically until the template itself is edited, and a verdict that reads FAIL
 * forever for a reason this render cannot fix is one you stop reading — the
 * same cry-wolf failure the content check already had once and has a regression
 * test against. Template findings are carried as notes beneath the verdict
 * instead, where they are visible without voting.
 *
 * Everything here keys off a change-log `action` or a finding `severity` — a
 * closed vocabulary — and never off the prose in a `detail`, which is written
 * for a human and would make this brittle the first time someone reworded it.
 */

export type VerdictInput = {
  coverage: { missing: string[] };
  findings: { severity: "blocking" | "warning"; message: string }[];
  changeLog: { section: string; action: string }[];
};

export type Verdict = {
  pass: boolean;
  /** Why it failed. Empty exactly when `pass` is true. */
  reasons: string[];
  /** True of the template rather than of this reformat. Never votes. */
  notes: string[];
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The change-log actions that put source text into a section. */
const WROTE_SOURCE = new Set(["replaced", "cloned-overflow", "feathered"]);

/** The sections named by a set of change-log entries, deduplicated, in order. */
function sections(entries: { section: string }[]): string {
  return [...new Set(entries.map((e) => e.section))].join(", ");
}

export function verdictFor(r: VerdictInput): Verdict {
  const reasons: string[] = [];

  // The worst case and the first one said: text that went in and came out
  // nowhere. This is the claim the whole app rests on, so it fails outright.
  const lost = r.coverage.missing.length;
  if (lost > 0) {
    reasons.push(`${lost} ${plural(lost, "line", "lines")} of the source reached no part of the document.`);
  }

  // A blocking ATS finding is about the output, and a parser that cannot read
  // the document makes everything else moot.
  for (const f of r.findings) {
    if (f.severity === "blocking") reasons.push(f.message);
  }

  // Input the template had no room for. Also a content loss, and invisible in
  // the finished document, which is exactly why it has to be said here.
  //
  // `input-dropped` only. A *template* line the input had no counterpart for is
  // `template-trimmed`, and it is not a loss: reading it as one failed the repo's
  // own fixture pair at 100% coverage, and failed every render on the older
  // template over a blank line that is a property of the template.
  const dropped = r.changeLog.filter((c) => c.action === "input-dropped");
  if (dropped.length > 0) {
    reasons.push(
      `${dropped.length} ${plural(dropped.length, "entry", "entries")} had nowhere to go in the template and ` +
        `${plural(dropped.length, "was", "were")} dropped — ${sections(dropped)}.`
    );
  }

  const notes = r.findings.filter((f) => f.severity === "warning").map((f) => f.message);

  // Template text the source did not replace (`not-found-in-input`), which
  // ships the template's own words. **Whole sections only** warn (TEC-105,
  // 2026-10-18). A section the source left entirely empty — a Summary
  // the Jobright export lacks — is a note, and the render passes and downloads.
  // A section the source filled **only in part** still fails, so the
  // template's own figures never ship on a downloadable resume: today that is
  // a Career Highlights cell the source had no highlight for.
  //
  // Partial is told apart by the log alone: the same section also carries an
  // entry that wrote source text into it. That reads a stored render's log the
  // same way, so older records reopen with the verdict this rule gives them.
  // Source text that existed and had no slot is a third case, and fails above
  // through `coverage.missing`.
  const unfilled = r.changeLog.filter((c) => c.action === "not-found-in-input");
  const written = new Set(r.changeLog.filter((c) => WROTE_SOURCE.has(c.action)).map((c) => c.section));
  const partly = unfilled.filter((c) => written.has(c.section));
  const wholly = unfilled.filter((c) => !written.has(c.section));
  if (partly.length > 0) {
    reasons.push(
      `The source filled ${sections(partly)} only in part, so ${partly.length} ` +
        `${plural(partly.length, "entry keeps", "entries keep")} the template's own text.`
    );
  }
  if (wholly.length > 0) {
    const n = new Set(wholly.map((c) => c.section)).size;
    notes.push(
      `The source did not fill ${n} ${plural(n, "section", "sections")} of the ` +
        `template, which keeps its own text — ${sections(wholly)}.`
    );
  }

  // Template lines with no counterpart in the input were left out. Worth saying,
  // never worth failing over.
  const trimmed = r.changeLog.filter((c) => c.action === "template-trimmed");
  if (trimmed.length > 0) {
    notes.push(
      `${trimmed.length} template ${plural(trimmed.length, "line", "lines")} with no counterpart in the source ` +
        `${plural(trimmed.length, "was", "were")} left out — ${sections(trimmed)}.`
    );
  }

  // Source text refused rather than guessed at, so not placed. Said every time,
  // because a report silent about it reads as a source that had none (TEC-79).
  // A note, not a vote: today it is only Career Highlights, which repeat items
  // from the body, so no unique content is lost (TEC-87, 2026-09-29).
  const notRead = r.changeLog.filter((c) => c.action === "input-not-read");
  if (notRead.length > 0) {
    notes.push(
      `Part of the source could not be read, so it was not placed and the template's own text was kept — ` +
        `${sections(notRead)}. It repeats items from the body, so this does not fail the reformat.`
    );
  }

  // Professional Experience lines the template had no slot for, inserted where
  // the input has them (TEC-107). The text arrived, so it never votes — but the
  // formatting is a sibling's guess, so it is worth a look before sending.
  const feathered = r.changeLog.filter((c) => c.action === "feathered");
  if (feathered.length > 0) {
    notes.push(
      `${feathered.length} ${plural(feathered.length, "line", "lines")} of Professional Experience had no slot in the ` +
        `template and ${plural(feathered.length, "was", "were")} feathered in where the input has ${plural(feathered.length, "it", "them")}, ` +
        `formatted like the nearest template line.`
    );
  }

  return { pass: reasons.length === 0, reasons, notes };
}
