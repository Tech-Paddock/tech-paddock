import type { AtsFinding } from "@/lib/docx/ats";
import type { ContentCheck } from "@/lib/docx/compare";
import type { ChangeAction, ChangeLogEntry } from "@/lib/reskin/types";
import { fileLabel } from "@/lib/resumes";

/**
 * A stored render, reopened: the same shape `/api/reformat` answers with, read
 * back from what the render wrote down rather than produced again.
 *
 * **Nothing here re-renders.** Coverage is `renders.coverage` and the change log
 * is `renders.template_snapshot.changeLog`, both written once when the render
 * ran. The ATS findings were never stored, so the route reads them off the
 * stored output bytes — the document that went out, not a new one — and they
 * are the one part that reflects today's lint rather than the lint of the day.
 *
 * **An unread record must not look like a clean one.** A render written before
 * the change log was stored, or whose log uses an action the verdict no longer
 * knows, has nothing honest to vote with: an empty list there would read as
 * "nothing went wrong" and the screen would say PASS about a reformat it never
 * checked. So those arrive with the field null and a sentence in `unread`
 * saying why, and the screen shows no verdict at all.
 */

/** Every action the verdict knows how to weigh. Kept in step with `ChangeAction`. */
const KNOWN_ACTIONS: readonly ChangeAction[] = [
  "replaced",
  "kept-unchanged",
  "cloned-overflow",
  "template-trimmed",
  "input-dropped",
  "not-found-in-input",
  "passthrough",
];

export type StoredRenderRow = {
  id: string;
  template_snapshot: unknown;
  parsed_content: unknown;
  coverage: unknown;
  output_file_path: string | null;
  submitted_at: string | null;
};

export type StoredRenderSummary = {
  experience: { company: string; title: string; date: string; bullets: number }[];
  highlights: number;
  competencies: number;
  hasSummary: boolean;
};

export type StoredRenderView = {
  filename: string;
  renderId: string;
  templateLabel: string;
  coverage: ContentCheck | null;
  findings: AtsFinding[];
  changeLog: ChangeLogEntry[] | null;
  summary: StoredRenderSummary | null;
  /** Why no verdict can be given. Empty exactly when coverage and the change log were both read. */
  unread: string[];
  /** The stored bytes, not a re-render. */
  downloadHref: string;
  /** Where it was logged, when it was: the tracker thread's company. */
  loggedTo: string | null;
  submittedAt: string | null;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function readCoverage(raw: unknown): ContentCheck | null {
  if (!isObject(raw)) return null;
  const { totalLines, present, missing, percent } = raw;
  if (typeof totalLines !== "number" || typeof present !== "number" || typeof percent !== "number") return null;
  if (!Array.isArray(missing) || !missing.every((m) => typeof m === "string")) return null;
  return { totalLines, present, missing, percent };
}

function readChangeLog(snapshot: unknown): { log: ChangeLogEntry[] | null; unknown: string[] } {
  if (!isObject(snapshot) || !Array.isArray(snapshot.changeLog)) return { log: null, unknown: [] };
  const log: ChangeLogEntry[] = [];
  const unknownActions = new Set<string>();
  for (const e of snapshot.changeLog) {
    if (!isObject(e) || typeof e.section !== "string" || typeof e.action !== "string") return { log: null, unknown: [] };
    if (!KNOWN_ACTIONS.includes(e.action as ChangeAction)) unknownActions.add(e.action);
    log.push({ section: e.section, detail: typeof e.detail === "string" ? e.detail : "", action: e.action as ChangeAction });
  }
  return { log, unknown: [...unknownActions] };
}

function readSummary(content: unknown): StoredRenderSummary | null {
  if (!isObject(content) || !Array.isArray(content.experience)) return null;
  const experience = content.experience.filter(isObject).map((e) => ({
    company: typeof e.company === "string" ? e.company : "",
    title: typeof e.title === "string" ? e.title : "",
    date: typeof e.date === "string" ? e.date : "",
    bullets: Array.isArray(e.bullets) ? e.bullets.length : 0,
  }));
  return {
    experience,
    highlights: Array.isArray(content.careerHighlights) ? content.careerHighlights.length : 0,
    competencies: Array.isArray(content.competencies) ? content.competencies.length : 0,
    hasSummary: typeof content.summary === "string",
  };
}

export function storedRenderView(input: {
  render: StoredRenderRow;
  /** The template row, or null when it has since been deleted. */
  template: { name: string; version: number } | null;
  findings: AtsFinding[];
  loggedTo: string | null;
}): StoredRenderView {
  const { render, template, findings, loggedTo } = input;
  const snapshot = isObject(render.template_snapshot) ? render.template_snapshot : null;

  const coverage = readCoverage(render.coverage);
  const { log, unknown: unknownActions } = readChangeLog(snapshot);

  const unread: string[] = [];
  if (coverage === null) unread.push("No coverage was stored with this render.");
  if (log === null) unread.push("No change log was stored with this render — it predates the log being kept.");
  if (unknownActions.length > 0) {
    unread.push(
      `Its change log uses ${unknownActions.length === 1 ? "an action" : "actions"} this version no longer ` +
        `weighs (${unknownActions.join(", ")}), so a loss cannot be told from a trim.`
    );
  }

  // The template may have been deleted since; the render's own snapshot still
  // says which version it was built on, and that is the part that matters.
  const snapshotVersion = typeof snapshot?.version === "number" ? snapshot.version : null;
  const templateLabel = template
    ? `${template.name} (v${template.version})`
    : snapshotVersion !== null
      ? `a deleted template (v${snapshotVersion})`
      : "an unrecorded template";

  return {
    filename: fileLabel(render.output_file_path, "resume.docx"),
    renderId: render.id,
    templateLabel,
    coverage,
    findings,
    // A log with an unknown action cannot vote, but it is still worth showing
    // on Diagnostics — so it stays, and `unread` is what stops the verdict.
    changeLog: log,
    summary: readSummary(render.parsed_content),
    unread,
    downloadHref: `/api/renders/${render.id}/file`,
    loggedTo,
    submittedAt: render.submitted_at,
  };
}
