import {
  getEditorClient,
  getResumeClient,
  getServiceClient,
  getSharedClient,
} from "@/lib/supabase";
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

export type DashboardData = {
  generatedAt: string;
  commitments: Commitment[];
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
 * Calendar events matched to threads.
 *
 * Returns nothing until Microsoft Graph is wired, but every consumer is already
 * meeting-aware — commitments, the follow-up gap, and decay suppression for
 * threads with something already booked all read this. Wiring Graph is then a
 * change to this one function rather than a change to the dashboard.
 */
async function loadMeetings(): Promise<{ meetings: MeetingRow[]; degraded: string[] }> {
  return { meetings: [], degraded: [] };
}

export async function loadDashboard(now = new Date()): Promise<DashboardData> {
  const degraded: string[] = [];

  const since = new Date(now.getTime() - MESSAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [threadsRes, contactsRes, messagesRes, rendersRes, templateRes, meetingsRes] =
    await Promise.all([
      getServiceClient()
        .from("pipeline_threads")
        .select("id, contact_id, company, stage, last_touch_date, next_action, notes, created_at"),
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
      loadMeetings(),
    ]);

  if (threadsRes.error) degraded.push(`threads: ${threadsRes.error.message}`);
  if (contactsRes.error) degraded.push(`contacts: ${contactsRes.error.message}`);
  if (messagesRes.error) degraded.push(`messages: ${messagesRes.error.message}`);
  if (rendersRes.error) degraded.push(`renders: ${rendersRes.error.message}`);
  degraded.push(...meetingsRes.degraded);

  const threads = (threadsRes.data ?? []) as ThreadRow[];
  const contactRows = (contactsRes.data ?? []) as ContactRow[];
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const renders = (rendersRes.data ?? []) as RenderRow[];
  const meetings = meetingsRes.meetings;

  const contacts = new Map(contactRows.map((c) => [c.id, c]));

  const touches = new Map<string, Touch>(
    threads.map((t) => [t.id, effectiveTouch(t, messages, renders, meetings, now)])
  );

  const commitments = findCommitments(meetings, threads, now);
  const upcomingThreadIds = new Set(
    commitments.map((c) => c.threadId).filter((id): id is string => !!id)
  );

  const health: HealthItem[] = [];
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
