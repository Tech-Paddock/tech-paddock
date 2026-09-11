import {
  getEditorClient,
  getResumeClient,
  getServiceClient,
  getSharedClient,
} from "@/lib/supabase";
import { GraphEvent, fetchCalendar, graphConfigured } from "@/lib/graph";
import { MeetingMatch, matchMeetings } from "@/lib/matchMeetings";
import {
  Commitment,
  ContactRow,
  DecayedThread,
  LooseEnd,
  MeetingRow,
  MessageRow,
  RenderRow,
  Rhythm,
  ThreadRow,
  Touch,
  computeRhythm,
  effectiveTouch,
  findCommitments,
  findDecayed,
  findLooseEnds,
} from "@/lib/signals";

/** Enough history for a rhythm window and a follow-up gap, not the whole archive. */
const MESSAGE_LOOKBACK_DAYS = 90;
const RENDER_LIMIT = 100;

export type HealthItem = {
  kind: string;
  label: string;
  detail: string;
  severity: "urgent" | "warn" | "info";
  href?: string;
};

/**
 * A calendar event says a thread moved before you get round to saying so.
 * Surfaced as a suggestion with one-click confirm, never applied automatically
 * — the same posture as the model drift check, which flags a new model and
 * refuses to swap the pinned one for you.
 */
export type StageSuggestion = {
  threadId: string;
  company: string;
  currentStage: string;
  suggestedStage: string;
  because: string;
};

export type DashboardData = {
  generatedAt: string;
  commitments: Commitment[];
  suggestions: StageSuggestion[];
  decay: DecayedThread[];
  looseEnds: LooseEnd[];
  rhythm: Rhythm;
  health: HealthItem[];
  threads: ThreadRow[];
  contacts: Map<string, ContactRow>;
  touches: Map<string, Touch>;
  /**
   * Which sources failed to load. The dashboard aggregates four schemas; one
   * being unreachable should degrade the page, not blank it, and should say so
   * rather than quietly reporting zero.
   */
  degraded: string[];
};

/**
 * The raw calendar, before it knows anything about threads.
 *
 * An unconfigured Outlook is a setup step, not a failure — it reports as health
 * and leaves the rest of the dashboard intact. A configured Outlook that errors
 * is a real problem and degrades loudly.
 */
async function loadCalendar(
  now: Date
): Promise<{ events: GraphEvent[]; degraded: string[]; health: HealthItem[] }> {
  if (!graphConfigured()) {
    return {
      events: [],
      degraded: [],
      health: [
        {
          kind: "outlook_not_connected",
          label: "Outlook is not connected",
          detail:
            "Interviews, the follow-up gap and stage suggestions stay empty until Graph credentials are set.",
          severity: "info",
        },
      ],
    };
  }

  try {
    return { events: await fetchCalendar(now), degraded: [], health: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { events: [], degraded: [`calendar: ${message}`], health: [] };
  }
}

/** Stages a booked meeting is evidence of having moved past. */
const PRE_INTERVIEW_STAGES = new Set(["Applied", "Networking"]);

function suggestStages(
  matches: MeetingMatch[],
  threads: ThreadRow[],
  now: Date
): StageSuggestion[] {
  const threadsById = new Map(threads.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: StageSuggestion[] = [];

  for (const match of matches) {
    if (!match.threadId || seen.has(match.threadId)) continue;
    const thread = threadsById.get(match.threadId);
    if (!thread || !PRE_INTERVIEW_STAGES.has(thread.stage)) continue;

    seen.add(match.threadId);
    const when = new Date(match.meeting.starts_at) > now ? "is booked" : "happened";
    out.push({
      threadId: thread.id,
      company: thread.company,
      currentStage: thread.stage,
      suggestedStage: "Interviewing",
      because: `A meeting ${when}${match.reason ? ` — ${match.reason}` : ""}.`,
    });
  }

  return out;
}

export async function loadDashboard(now = new Date()): Promise<DashboardData> {
  const degraded: string[] = [];

  const since = new Date(now.getTime() - MESSAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [threadsRes, contactsRes, messagesRes, rendersRes, templateRes, calendarRes] =
    await Promise.all([
      getServiceClient()
        .from("pipeline_threads")
        .select(
          "id, contact_id, company, stage, last_touch_date, next_action, notes, open_task_id, created_at"
        ),
      getSharedClient().from("contacts").select("id, name, org, preferred_channel"),
      getEditorClient()
        .from("message_history")
        .select("contact_id, medium, purpose, sent_at")
        .gte("sent_at", since.toISOString()),
      getResumeClient()
        .from("renders")
        .select("id, thread_id, created_at, submitted_at, output_file_path")
        .order("created_at", { ascending: false })
        .limit(RENDER_LIMIT),
      getResumeClient().from("templates").select("id, name, version").eq("is_active", true),
      loadCalendar(now),
    ]);

  if (threadsRes.error) degraded.push(`threads: ${threadsRes.error.message}`);
  if (contactsRes.error) degraded.push(`contacts: ${contactsRes.error.message}`);
  if (messagesRes.error) degraded.push(`messages: ${messagesRes.error.message}`);
  if (rendersRes.error) degraded.push(`renders: ${rendersRes.error.message}`);
  degraded.push(...calendarRes.degraded);

  const threads = (threadsRes.data ?? []) as ThreadRow[];
  const contactRows = (contactsRes.data ?? []) as ContactRow[];
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const renders = (rendersRes.data ?? []) as RenderRow[];

  const contacts = new Map(contactRows.map((c) => [c.id, c]));

  // Matching needs the threads, so it happens after the fan-out rather than
  // inside it. An event that matches nothing stays in the list unattached: it
  // is still a commitment, it just has no thread context to show alongside.
  const matches = matchMeetings(calendarRes.events, threads, contacts);
  const meetings = matches.map((m) => m.meeting);

  const touches = new Map<string, Touch>(
    threads.map((t) => [t.id, effectiveTouch(t, messages, renders, meetings, now)])
  );

  const commitments = findCommitments(meetings, threads, now);
  const upcomingThreadIds = new Set(
    commitments.map((c) => c.threadId).filter((id): id is string => !!id)
  );

  const health: HealthItem[] = [...calendarRes.health];
  if (!templateRes.error && (templateRes.data ?? []).length === 0) {
    health.push({
      kind: "no_active_template",
      label: "No active resume template",
      detail: "The Resume Formatter cannot render until a template is uploaded and activated.",
      severity: "warn",
    });
  }
  if (templateRes.error) degraded.push(`templates: ${templateRes.error.message}`);

  return {
    generatedAt: now.toISOString(),
    commitments,
    suggestions: suggestStages(matches, threads, now),
    decay: findDecayed(threads, touches, upcomingThreadIds, now),
    looseEnds: findLooseEnds(threads, contacts, messages, renders, meetings, now),
    rhythm: computeRhythm(threads, messages, renders, meetings, now),
    health,
    threads,
    contacts,
    touches,
    degraded,
  };
}

export type { Commitment, DecayedThread, LooseEnd, Rhythm, ThreadRow, Touch };
