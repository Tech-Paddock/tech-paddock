/**
 * The hub's landing glance.
 *
 * The hub holds no database credentials and talks to no schema — it asks each
 * tool for its own roll-up and merges the answers. Adding a tool to the glance
 * is then a matter of that tool exposing `/api/summary` in this shape and
 * getting a line in SOURCES, not of teaching the hub anything new.
 *
 * What comes back is deliberately narrow: counts and singles, never rows. The
 * hub is the three seconds before you click into a tool; the tools are where
 * the work happens. A hub handed thread arrays slowly becomes a worse copy of
 * the tracker, so it is never handed any.
 *
 * **A source that did not answer says why, and never reads as zero.** Every
 * failure used to collapse into the same `null`, and the Paper then rendered the
 * empty glance's zeros as "nothing outstanding" — for a request it never made.
 */

export type Severity = "urgent" | "warn" | "info";

export type SummaryItem = {
  label: string;
  detail: string | null;
  href: string;
  severity: Severity;
};

export type SummarySlot = { count: number; top: SummaryItem | null };

export type ToolSummary = {
  tool: string;
  /** Null when the tool answered without stamping one. */
  generatedAt: string | null;
  commitments: { items: SummaryItem[]; overflow: number };
  decay: SummarySlot;
  looseEnds: SummarySlot;
  rhythm: SummaryItem | null;
  health: SummaryItem[];
  degraded: string[];
};

/**
 * When a source last spoke for itself, so the page can say how old its answer
 * is rather than presenting a cached number as if it were current.
 *
 * `generatedAt` is null when the tool answered without stamping one, which is
 * different from not answering at all — that case is `unavailable` below.
 */
export type SourceFreshness = { tool: string; generatedAt: string | null };

/**
 * A source that did not answer, and why.
 *
 * The why is the point. A secret never set, a secret that differs, a tool that
 * is down and a tool that changed its shape are four different fixes.
 */
export type Unanswered = { tool: string; why: string };

export type Glance = {
  commitments: SummaryItem[];
  commitmentOverflow: number;
  decay: SummarySlot;
  looseEnds: SummarySlot;
  rhythm: SummaryItem[];
  health: SummaryItem[];
  /** Tools that did not answer, named with the reason so the page can say so out loud. */
  unavailable: Unanswered[];
  /** Partial-data warnings the tools reported about themselves. */
  degraded: string[];
  /** One entry per source that answered, for the staleness rule. */
  sources: SourceFreshness[];
};

/**
 * How often a source is expected to speak. Past three times this it is treated
 * as stale and says so loudly, which is the settled rule.
 *
 * One value for every source today because no tool declares its own cadence.
 * When one does, this moves next to that source rather than growing a table
 * here — the hub is not supposed to know a tool's habits.
 */
export const SOURCE_CADENCE_MS = 15 * 60 * 1000;

export const STALE_AFTER = 3;

/** Older than three cadences, or answered without saying when. */
export function isStale(source: SourceFreshness, now = Date.now()): boolean {
  if (!source.generatedAt) return true;
  const at = Date.parse(source.generatedAt);
  if (Number.isNaN(at)) return true;
  return now - at > STALE_AFTER * SOURCE_CADENCE_MS;
}

const SEVERITY_RANK: Record<Severity, number> = { urgent: 3, warn: 2, info: 1 };

/** A slow tool should not hold up the whole page. */
const FETCH_TIMEOUT_MS = 4000;

function trackerBase() {
  // `||`, not `??`: a variable saved empty in the dashboard is "" rather than
  // undefined, and "" + "/api/summary" is a relative URL fetch rejects.
  return (process.env.TRACKER_BASE_URL || "https://tracker.techpaddock.io").replace(/\/+$/, "");
}

export const SOURCES: { tool: string; url: string }[] = [
  { tool: "Pipeline Tracker", url: `${trackerBase()}/api/summary` },
];

export const EMPTY_GLANCE: Glance = {
  commitments: [],
  commitmentOverflow: 0,
  decay: { count: 0, top: null },
  looseEnds: { count: 0, top: null },
  rhythm: [],
  health: [],
  unavailable: [],
  degraded: [],
  sources: [],
};

export type Fetched = { ok: true; summary: ToolSummary } | { ok: false; why: string };

const SEVERITIES = new Set<string>(["urgent", "warn", "info"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isItem(v: unknown): v is SummaryItem {
  return (
    isObject(v) &&
    typeof v.label === "string" &&
    (v.detail === null || v.detail === undefined || typeof v.detail === "string") &&
    typeof v.href === "string" &&
    typeof v.severity === "string" &&
    SEVERITIES.has(v.severity)
  );
}

function isSlot(v: unknown): v is SummarySlot {
  return isObject(v) && typeof v.count === "number" && (v.top === null || v.top === undefined || isItem(v.top));
}

/**
 * Checked before anything is merged, so one renamed field in a tool becomes
 * "wrong shape" on that one source instead of a TypeError that takes the whole
 * landing page down with it.
 */
export function parseSummary(raw: unknown): ToolSummary | null {
  if (!isObject(raw)) return null;
  const c = raw.commitments;
  if (!isObject(c) || !Array.isArray(c.items) || !c.items.every(isItem) || typeof c.overflow !== "number") {
    return null;
  }
  const decay = raw.decay;
  const looseEnds = raw.looseEnds;
  if (!isSlot(decay) || !isSlot(looseEnds)) return null;
  const rhythm = raw.rhythm;
  if (!(rhythm === null || rhythm === undefined || isItem(rhythm))) return null;
  const health = raw.health;
  if (!Array.isArray(health) || !health.every(isItem)) return null;
  const degraded = raw.degraded;
  if (!Array.isArray(degraded) || !degraded.every((d) => typeof d === "string")) return null;

  return {
    tool: typeof raw.tool === "string" ? raw.tool : "",
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
    commitments: { items: c.items, overflow: c.overflow },
    decay: { count: decay.count, top: decay.top ?? null },
    looseEnds: { count: looseEnds.count, top: looseEnds.top ?? null },
    rhythm: rhythm ?? null,
    health,
    degraded,
  };
}

/** Node's fetch says "fetch failed" for everything and puts the real cause underneath. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "threw a non-error";
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${code} — ${cause.message}` : cause.message;
  }
  return error.message;
}

/**
 * Asks one tool for its roll-up, and says why when it gets none.
 *
 * Returns a reason rather than null for the same reason `lib/pitwall.ts` does:
 * the page has to tell "the hub never asked" from "the tool said no" from "the
 * tool said something this page cannot read".
 */
export async function fetchSummary(
  url: string,
  secret: string | undefined = process.env.INTERNAL_API_SECRET,
): Promise<Fetched> {
  if (!secret) return { ok: false, why: "hub secret unset — no request made" };

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, why: "timeout" };
    return { ok: false, why: `unreachable — ${describe(error)}` };
  }

  if (res.status === 401) return { ok: false, why: "401 — secrets differ" };
  if (!res.ok) {
    return { ok: false, why: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}` };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { ok: false, why: "wrong shape — not JSON" };
  }
  const summary = parseSummary(raw);
  return summary ? { ok: true, summary } : { ok: false, why: "wrong shape" };
}

/** Higher severity wins; ties keep whichever arrived first. */
function pickTop(a: SummaryItem | null, b: SummaryItem | null): SummaryItem | null {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a;
}

/** Folds each source's answer into one glance. Pure, so it is tested directly. */
export function mergeGlance(results: { tool: string; fetched: Fetched }[]): Glance {
  const glance: Glance = {
    commitments: [],
    commitmentOverflow: 0,
    decay: { count: 0, top: null },
    looseEnds: { count: 0, top: null },
    rhythm: [],
    health: [],
    unavailable: [],
    degraded: [],
    sources: [],
  };

  for (const { tool, fetched } of results) {
    if (!fetched.ok) {
      glance.unavailable.push({ tool, why: fetched.why });
      continue;
    }
    const summary = fetched.summary;

    glance.sources.push({ tool, generatedAt: summary.generatedAt });
    glance.commitments.push(...summary.commitments.items);
    glance.commitmentOverflow += summary.commitments.overflow;

    glance.decay = {
      count: glance.decay.count + summary.decay.count,
      top: pickTop(glance.decay.top, summary.decay.top),
    };
    glance.looseEnds = {
      count: glance.looseEnds.count + summary.looseEnds.count,
      top: pickTop(glance.looseEnds.top, summary.looseEnds.top),
    };

    if (summary.rhythm) glance.rhythm.push(summary.rhythm);
    glance.health.push(...summary.health);
    glance.degraded.push(...summary.degraded.map((d) => `${tool}: ${d}`));
  }

  glance.commitments.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  return glance;
}

export async function loadGlance(): Promise<Glance> {
  const results = await Promise.all(
    SOURCES.map(async (source) => ({ tool: source.tool, fetched: await fetchSummary(source.url) })),
  );
  return mergeGlance(results);
}

/**
 * True only when every source answered, whole, and reported nothing. A source
 * that did not answer, or answered with gaps, is never "quiet" — that was the
 * "nothing outstanding" this page used to print when it had not asked.
 */
export function isQuiet(glance: Glance): boolean {
  return (
    glance.unavailable.length === 0 &&
    glance.degraded.length === 0 &&
    glance.commitments.length === 0 &&
    glance.decay.count === 0 &&
    glance.looseEnds.count === 0 &&
    glance.health.length === 0
  );
}

/** No source answered, so no count on the page is a count — render "—", never 0. */
export function nothingAnswered(glance: Glance): boolean {
  return glance.sources.length === 0;
}
