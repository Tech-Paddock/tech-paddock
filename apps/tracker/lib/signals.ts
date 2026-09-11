/**
 * Derivation layer for the dashboard.
 *
 * Everything here is pure: rows in, signals out, no I/O. The tracker's staleness
 * sort was built on `last_touch_date`, which is only ever set by hand — so the
 * one number the whole view depends on is the one you are least likely to keep
 * current. These functions derive touch from evidence instead: a message you
 * actually sent, a resume that actually went out, a meeting that actually
 * happened. The recorded date stays as a floor, never a ceiling.
 */

export type ThreadRow = {
  id: string;
  contact_id: string | null;
  company: string;
  stage: string;
  last_touch_date: string;
  next_action: string | null;
  notes: string | null;
  open_task_id: string | null;
  created_at: string;
};

export type MessageRow = {
  contact_id: string | null;
  medium: string;
  purpose: string;
  sent_at: string;
};

export type RenderRow = {
  id: string;
  thread_id: string | null;
  created_at: string;
  submitted_at: string | null;
  output_file_path: string | null;
};

/** A calendar event already matched to a thread. Empty until Graph is wired. */
export type MeetingRow = {
  id: string;
  thread_id: string | null;
  subject: string;
  starts_at: string;
  ends_at: string;
  organizer_email: string | null;
};

export type ContactRow = {
  id: string;
  name: string;
  org: string | null;
  preferred_channel: string | null;
};

export type TouchSource = "recorded" | "message" | "render" | "meeting";

export type Touch = {
  at: string;
  source: TouchSource;
  /** True when evidence is fresher than the hand-recorded date. */
  aheadOfRecord: boolean;
};

export type DecayReason = "stale" | "interviewing_stall" | "offer_silence";

export type Severity = "urgent" | "warn" | "info";

/**
 * Per-stage decay thresholds, in days.
 *
 * A flat 10 days treats an untouched application the same as an interview
 * that went quiet, and those are not the same problem. Threads at Interviewing
 * and Offer are the most valuable and the most painful to lose, so they get a
 * shorter fuse; Cooling is deliberately cooling and should not nag.
 */
export const DECAY_THRESHOLDS: Record<string, number> = {
  Applied: 10,
  Networking: 10,
  Interviewing: 7,
  Offer: 3,
  Cooling: 21,
};

/** Threads at these stages never decay. */
const TERMINAL_STAGES = new Set(["Closed"]);

export const DEFAULT_DECAY_DAYS = 10;

/** A render tailored but never sent is sunk effort; give it a few days' grace. */
export const UNSENT_RENDER_DAYS = 3;

/** How long after a meeting a missing follow-up counts as a gap. */
export const FOLLOW_UP_GAP_HOURS = 24;

/** Commitments only surface when they are close enough to act on. */
export const COMMITMENT_WINDOW_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `last_touch_date` is a date, everything else is a timestamp. Parse the date
 * as UTC midnight so comparisons are stable on a UTC server rather than
 * drifting with whatever timezone the request happens to run in.
 */
export function parseTouchDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

export function daysSince(iso: string, now: Date): number {
  const then = iso.length <= 10 ? parseTouchDate(iso) : new Date(iso);
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

export function hoursSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / (60 * 60 * 1000));
}

/**
 * The real last touch: the latest of what you recorded and what actually
 * happened. Messages only count when the thread has a linked contact — an
 * unlinked thread has no way to know which messages were about it.
 */
export function effectiveTouch(
  thread: ThreadRow,
  messages: MessageRow[],
  renders: RenderRow[],
  meetings: MeetingRow[],
  now: Date
): Touch {
  const recorded = parseTouchDate(thread.last_touch_date);
  let best = recorded;
  let source: TouchSource = "recorded";

  const consider = (iso: string | null, candidate: TouchSource) => {
    if (!iso) return;
    const at = new Date(iso);
    // A touch dated in the future is a data-entry slip, not evidence.
    if (at.getTime() > now.getTime()) return;
    if (at.getTime() > best.getTime()) {
      best = at;
      source = candidate;
    }
  };

  if (thread.contact_id) {
    for (const m of messages) {
      if (m.contact_id === thread.contact_id) consider(m.sent_at, "message");
    }
  }
  for (const r of renders) {
    if (r.thread_id === thread.id) consider(r.submitted_at, "render");
  }
  for (const e of meetings) {
    if (e.thread_id === thread.id) consider(e.ends_at, "meeting");
  }

  return {
    at: best.toISOString(),
    source,
    aheadOfRecord: source !== "recorded",
  };
}

export function decayThresholdFor(stage: string): number {
  return DECAY_THRESHOLDS[stage] ?? DEFAULT_DECAY_DAYS;
}

export type DecayedThread = {
  thread: ThreadRow;
  touch: Touch;
  days: number;
  threshold: number;
  reason: DecayReason;
  severity: Severity;
};

function decayReasonFor(stage: string): DecayReason {
  if (stage === "Interviewing") return "interviewing_stall";
  if (stage === "Offer") return "offer_silence";
  return "stale";
}

/**
 * Threads past their stage's threshold, worst first. A thread with an upcoming
 * meeting is not decaying no matter how long the silence has been — the next
 * step is already on the calendar.
 */
export function findDecayed(
  threads: ThreadRow[],
  touches: Map<string, Touch>,
  upcomingThreadIds: Set<string>,
  now: Date
): DecayedThread[] {
  const out: DecayedThread[] = [];

  for (const thread of threads) {
    if (TERMINAL_STAGES.has(thread.stage)) continue;
    if (upcomingThreadIds.has(thread.id)) continue;

    const touch = touches.get(thread.id);
    if (!touch) continue;

    const days = daysSince(touch.at, now);
    const threshold = decayThresholdFor(thread.stage);
    if (days < threshold) continue;

    const reason = decayReasonFor(thread.stage);
    out.push({
      thread,
      touch,
      days,
      threshold,
      reason,
      // A quiet offer or a stalled interview outranks a cold application:
      // those are threads you already won something on.
      severity: reason === "stale" ? "warn" : "urgent",
    });
  }

  return out.sort((a, b) => b.days - a.days);
}

export type LooseEndKind =
  | "unsent_render"
  | "follow_up_gap"
  | "no_next_action";

export type LooseEnd = {
  kind: LooseEndKind;
  label: string;
  detail: string;
  severity: Severity;
  threadId: string | null;
  contactId: string | null;
  renderId: string | null;
  /** Sorts the queue; higher acts first. */
  weight: number;
};

/**
 * Work already done that has not been cashed in.
 *
 * This is the category nothing in Paddock surfaces today, and it is the one
 * where the cost is invisible: a resume you tailored and never sent, or an
 * interview you had and never followed up on, both look exactly like nothing
 * from inside the tracker.
 */
export function findLooseEnds(
  threads: ThreadRow[],
  contacts: Map<string, ContactRow>,
  messages: MessageRow[],
  renders: RenderRow[],
  meetings: MeetingRow[],
  now: Date
): LooseEnd[] {
  const out: LooseEnd[] = [];
  const threadsById = new Map(threads.map((t) => [t.id, t]));

  // A render with no submission, past its grace period.
  for (const render of renders) {
    if (render.submitted_at) continue;
    const age = daysSince(render.created_at, now);
    if (age < UNSENT_RENDER_DAYS) continue;

    const thread = render.thread_id ? threadsById.get(render.thread_id) : undefined;
    out.push({
      kind: "unsent_render",
      label: thread ? `Resume for ${thread.company} never sent` : "Tailored resume never sent",
      detail: `Rendered ${age} days ago, no submission recorded.`,
      severity: "warn",
      threadId: render.thread_id,
      contactId: thread?.contact_id ?? null,
      renderId: render.id,
      weight: 60 + Math.min(age, 30),
    });
  }

  // A meeting that happened with no message logged to that contact since.
  // This is the one that actually costs offers.
  for (const meeting of meetings) {
    const endedHoursAgo = hoursSince(meeting.ends_at, now);
    if (endedHoursAgo < FOLLOW_UP_GAP_HOURS) continue;
    // Only chase the recent past; a meeting from last month is history.
    if (endedHoursAgo > 14 * 24) continue;

    const thread = meeting.thread_id ? threadsById.get(meeting.thread_id) : undefined;
    if (!thread?.contact_id) continue;

    const followed = messages.some(
      (m) =>
        m.contact_id === thread.contact_id &&
        new Date(m.sent_at).getTime() > new Date(meeting.ends_at).getTime()
    );
    if (followed) continue;

    const contact = contacts.get(thread.contact_id);
    out.push({
      kind: "follow_up_gap",
      label: `No follow-up after ${thread.company}`,
      detail: `Met ${Math.floor(endedHoursAgo / 24) || "under a"} day${
        Math.floor(endedHoursAgo / 24) === 1 ? "" : "s"
      } ago${contact ? ` with ${contact.name}` : ""}, nothing sent since.`,
      severity: "urgent",
      threadId: thread.id,
      contactId: thread.contact_id,
      renderId: null,
      weight: 90 + Math.min(Math.floor(endedHoursAgo / 24), 10),
    });
  }

  // A live thread with no defined next step is a thread that quietly stops.
  for (const thread of threads) {
    if (TERMINAL_STAGES.has(thread.stage)) continue;
    if (thread.next_action?.trim()) continue;
    out.push({
      kind: "no_next_action",
      label: `${thread.company} has no next action`,
      detail: `At ${thread.stage} with nothing written down to do next.`,
      severity: "info",
      threadId: thread.id,
      contactId: thread.contact_id,
      renderId: null,
      weight: 20,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

export type Rhythm = {
  messages: number;
  applications: number;
  threadsOpened: number;
  meetings: number;
  /** ISO date the counting window opened. */
  since: string;
};

/** Monday, as the start of the week you are currently in. */
export function startOfWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d;
}

/**
 * Did you do the reps. Job searches die from inconsistency far more often than
 * from any single thread going wrong, and conversion rates over a few dozen
 * threads are noise — so this counts effort, not outcomes.
 */
export function computeRhythm(
  threads: ThreadRow[],
  messages: MessageRow[],
  renders: RenderRow[],
  meetings: MeetingRow[],
  now: Date
): Rhythm {
  const since = startOfWeek(now);
  const after = (iso: string | null) => !!iso && new Date(iso).getTime() >= since.getTime();

  return {
    messages: messages.filter((m) => after(m.sent_at)).length,
    applications: renders.filter((r) => after(r.submitted_at)).length,
    threadsOpened: threads.filter((t) => after(t.created_at)).length,
    meetings: meetings.filter((e) => after(e.ends_at) && new Date(e.ends_at) <= now).length,
    since: since.toISOString().slice(0, 10),
  };
}

export type Commitment = {
  meetingId: string;
  threadId: string | null;
  label: string;
  company: string | null;
  startsAt: string;
  endsAt: string;
  hoursAway: number;
};

/**
 * Externally imposed, has a clock, outranks everything else on the page when
 * it exists. Usually empty — which is the point: an empty commitments slot is
 * information too.
 */
export function findCommitments(
  meetings: MeetingRow[],
  threads: ThreadRow[],
  now: Date
): Commitment[] {
  const threadsById = new Map(threads.map((t) => [t.id, t]));
  const horizon = now.getTime() + COMMITMENT_WINDOW_HOURS * 60 * 60 * 1000;

  return meetings
    .filter((m) => {
      const starts = new Date(m.starts_at).getTime();
      return starts >= now.getTime() && starts <= horizon;
    })
    .map((m) => {
      const thread = m.thread_id ? threadsById.get(m.thread_id) : undefined;
      return {
        meetingId: m.id,
        threadId: m.thread_id,
        label: m.subject,
        company: thread?.company ?? null,
        startsAt: m.starts_at,
        endsAt: m.ends_at,
        hoursAway: Math.max(0, -hoursSince(m.starts_at, now)),
      };
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
