/**
 * Pass or fail for one reformat, and why.
 *
 * Joel asked for this on 2026-09-19: *"I need a pass fail indicator on the front
 * page. if there were any irregularites with the reformat it should fail and
 * give reason."* It is the one judgement allowed on the Reformat tab, which
 * otherwise carries no readouts at all by his instruction the same day. A
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

  // A section of the template the source never filled. Not a loss, but the
  // document goes out carrying the template's own words for it. Counted by
  // section, because the sentence says sections.
  const unfilled = r.changeLog.filter((c) => c.action === "not-found-in-input");
  if (unfilled.length > 0) {
    const n = new Set(unfilled.map((c) => c.section)).size;
    reasons.push(
      `The source did not fill ${n} ${plural(n, "section", "sections")} of the ` +
        `template, which keeps its own text — ${sections(unfilled)}.`
    );
  }

  const notes = r.findings.filter((f) => f.severity === "warning").map((f) => f.message);

  // Template lines with no counterpart in the input were left out. Worth saying,
  // never worth failing over.
  const trimmed = r.changeLog.filter((c) => c.action === "template-trimmed");
  if (trimmed.length > 0) {
    notes.push(
      `${trimmed.length} template ${plural(trimmed.length, "line", "lines")} with no counterpart in the source ` +
        `${plural(trimmed.length, "was", "were")} left out — ${sections(trimmed)}.`
    );
  }

  return { pass: reasons.length === 0, reasons, notes };
}
