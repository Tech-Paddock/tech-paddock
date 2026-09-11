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
  generatedAt: string;
  commitments: { items: SummaryItem[]; overflow: number };
  decay: SummarySlot;
  looseEnds: SummarySlot;
  rhythm: SummaryItem | null;
  health: SummaryItem[];
  degraded: string[];
};

export type Glance = {
  commitments: SummaryItem[];
  commitmentOverflow: number;
  decay: SummarySlot;
  looseEnds: SummarySlot;
  rhythm: SummaryItem[];
  health: SummaryItem[];
  /** Tools that did not answer, named so the page can say so out loud. */
  unavailable: string[];
  /** Partial-data warnings the tools reported about themselves. */
  degraded: string[];
};

const SEVERITY_RANK: Record<Severity, number> = { urgent: 3, warn: 2, info: 1 };

/** A slow tool should not hold up the whole page. */
const FETCH_TIMEOUT_MS = 4000;

function trackerBase() {
  return (process.env.TRACKER_BASE_URL ?? "https://tracker.techpaddock.io").replace(/\/+$/, "");
}

const SOURCES: { tool: string; url: string }[] = [
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
};

async function fetchSummary(url: string): Promise<ToolSummary | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;

  try {
    const res = await fetch(url, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as ToolSummary;
  } catch {
    return null;
  }
}

/** Higher severity wins; ties keep whichever arrived first. */
function pickTop(a: SummaryItem | null, b: SummaryItem | null): SummaryItem | null {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a;
}

export async function loadGlance(): Promise<Glance> {
  const results = await Promise.all(
    SOURCES.map(async (source) => ({ source, summary: await fetchSummary(source.url) }))
  );

  const glance: Glance = { ...EMPTY_GLANCE, commitments: [], rhythm: [], health: [], unavailable: [], degraded: [] };

  for (const { source, summary } of results) {
    if (!summary) {
      glance.unavailable.push(source.tool);
      continue;
    }

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
    glance.degraded.push(...summary.degraded.map((d) => `${source.tool}: ${d}`));
  }

  glance.commitments.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );

  return glance;
}

/** True when there is genuinely nothing to report, as opposed to nothing loaded. */
export function isQuiet(glance: Glance): boolean {
  return (
    glance.commitments.length === 0 &&
    glance.decay.count === 0 &&
    glance.looseEnds.count === 0 &&
    glance.health.length === 0
  );
}
