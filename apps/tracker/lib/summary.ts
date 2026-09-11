import { DashboardData } from "@/lib/dashboard";
import { links } from "@/lib/links";
import { Severity } from "@/lib/signals";

/**
 * The narrowed, roll-up shape the hub consumes.
 *
 * The hub is a glance before you click into a tool; the tracker is where you
 * work. Keeping those apart is a design rule — the hub shows counts and
 * singles, never lists — and this shape is what enforces it. The hub renders
 * verdicts because verdicts are all it is ever handed: there is no thread array
 * here to accidentally build a table out of. The rich lists stay behind
 * `loadDashboard`, which only the tracker's own view calls.
 *
 * Every tool is expected to expose this same shape at `/api/summary`, so the
 * hub's fan-out grows by adding a URL rather than by learning a new format.
 */

export type SummaryItem = {
  label: string;
  detail: string | null;
  href: string;
  severity: Severity;
};

export type SummarySlot = {
  count: number;
  /** The single worst offender. Deliberately not the list. */
  top: SummaryItem | null;
};

export type ToolSummary = {
  tool: string;
  generatedAt: string;
  /**
   * The one slot allowed more than a single item: each commitment carries its
   * own clock, and "2 meetings" tells you nothing useful without the times.
   * Still bounded, with the remainder reported as a count.
   */
  commitments: { items: SummaryItem[]; overflow: number };
  decay: SummarySlot;
  looseEnds: SummarySlot;
  rhythm: SummaryItem | null;
  health: SummaryItem[];
  degraded: string[];
};

const MAX_COMMITMENTS = 3;

/**
 * Times are rendered server-side (the hub fetches this on the server so the
 * glance is there on arrival, not after a spinner), so the server has to be
 * told which clock to use — Vercel runs UTC, and "tomorrow 9:00" is wrong by a
 * timezone otherwise. Set PADDOCK_TIMEZONE if this default is not yours.
 */
const TIMEZONE = process.env.PADDOCK_TIMEZONE || "America/New_York";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The calendar day an instant falls on, in the configured timezone. */
function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function formatWhen(iso: string, now: Date): string {
  const start = new Date(iso);
  const time = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });

  if (dayKey(start) === dayKey(now)) return `today ${time}`;

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dayKey(start) === dayKey(tomorrow)) return `tomorrow ${time}`;

  return `${start.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: TIMEZONE,
  })} ${time}`;
}

export function toSummary(data: DashboardData, now = new Date()): ToolSummary {
  const commitments = data.commitments.slice(0, MAX_COMMITMENTS).map<SummaryItem>((c) => ({
    label: c.company ? `${c.company} — ${c.label}` : c.label,
    detail: formatWhen(c.startsAt, now),
    href: c.threadId ? links.thread(c.threadId) : links.dashboard(),
    severity: "urgent",
  }));

  const worstDecay = data.decay[0];
  const worstLooseEnd = data.looseEnds[0];

  return {
    tool: "tracker",
    generatedAt: data.generatedAt,
    commitments: {
      items: commitments,
      overflow: Math.max(0, data.commitments.length - MAX_COMMITMENTS),
    },
    decay: {
      count: data.decay.length,
      top: worstDecay
        ? {
            label: `${worstDecay.thread.company} — ${worstDecay.days}d quiet`,
            detail:
              worstDecay.reason === "interviewing_stall"
                ? "Interviewing, with nothing booked next."
                : worstDecay.reason === "offer_silence"
                  ? "An offer thread has gone quiet."
                  : `At ${worstDecay.thread.stage}.`,
            href: links.thread(worstDecay.thread.id),
            severity: worstDecay.severity,
          }
        : null,
    },
    looseEnds: {
      count: data.looseEnds.length,
      top: worstLooseEnd
        ? {
            label: worstLooseEnd.label,
            detail: worstLooseEnd.detail,
            href: looseEndHref(worstLooseEnd),
            severity: worstLooseEnd.severity,
          }
        : null,
    },
    rhythm: {
      label: `${plural(data.rhythm.messages, "message")}, ${plural(
        data.rhythm.applications,
        "application"
      )}`,
      detail: `This week${data.rhythm.meetings ? `, ${plural(data.rhythm.meetings, "meeting")}` : ""}`,
      href: links.dashboard(),
      severity: "info",
    },
    health: data.health.map<SummaryItem>((h) => ({
      label: h.label,
      detail: h.detail,
      href: h.href ?? links.dashboard(),
      severity: h.severity,
    })),
    degraded: data.degraded,
  };
}

function looseEndHref(end: {
  kind: string;
  renderId: string | null;
  contactId: string | null;
  threadId: string | null;
}): string {
  // Land where the work actually gets done, not just on the owning tool.
  if (end.kind === "unsent_render") {
    return end.renderId ? links.render(end.renderId) : links.renderHistory();
  }
  if (end.kind === "follow_up_gap" && end.contactId) {
    return links.draftTo(end.contactId);
  }
  return end.threadId ? links.thread(end.threadId) : links.dashboard();
}
