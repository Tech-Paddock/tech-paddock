import { describe, expect, it } from "vitest";
import {
  ContactRow,
  MeetingRow,
  MessageRow,
  RenderRow,
  ThreadRow,
  Touch,
  computeRhythm,
  decayThresholdFor,
  effectiveTouch,
  findCommitments,
  findDecayed,
  findLooseEnds,
  startOfWeek,
} from "@/lib/signals";

const NOW = new Date("2026-09-11T12:00:00Z");

function daysBefore(n: number, from = NOW): string {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAfter(n: number, from = NOW): string {
  return new Date(from.getTime() + n * 60 * 60 * 1000).toISOString();
}

function thread(over: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: "t1",
    contact_id: "c1",
    company: "SaltClick",
    stage: "Applied",
    last_touch_date: daysBefore(20).slice(0, 10),
    next_action: "Follow up",
    notes: null,
    open_task_id: null,
    created_at: daysBefore(30),
    ...over,
  };
}

function message(over: Partial<MessageRow> = {}): MessageRow {
  return { contact_id: "c1", medium: "email", purpose: "follow-up", sent_at: daysBefore(2), ...over };
}

function render(over: Partial<RenderRow> = {}): RenderRow {
  return {
    id: "r1",
    thread_id: "t1",
    created_at: daysBefore(10),
    submitted_at: null,
    output_file_path: "renders/r1.docx",
    ...over,
  };
}

function meeting(over: Partial<MeetingRow> = {}): MeetingRow {
  return {
    id: "m1",
    thread_id: "t1",
    subject: "Interview",
    starts_at: daysBefore(1),
    ends_at: daysBefore(1),
    organizer_email: "someone@saltclick.example",
    ...over,
  };
}

describe("effectiveTouch", () => {
  it("falls back to the recorded date when there is no evidence", () => {
    const touch = effectiveTouch(thread(), [], [], [], NOW);
    expect(touch.source).toBe("recorded");
    expect(touch.aheadOfRecord).toBe(false);
  });

  it("prefers a message newer than the recorded date", () => {
    const touch = effectiveTouch(thread(), [message({ sent_at: daysBefore(2) })], [], [], NOW);
    expect(touch.source).toBe("message");
    expect(touch.aheadOfRecord).toBe(true);
  });

  it("keeps the recorded date when it is newer than the evidence", () => {
    const recent = thread({ last_touch_date: daysBefore(1).slice(0, 10) });
    const touch = effectiveTouch(recent, [message({ sent_at: daysBefore(9) })], [], [], NOW);
    expect(touch.source).toBe("recorded");
  });

  it("ignores messages to a different contact", () => {
    const touch = effectiveTouch(thread(), [message({ contact_id: "someone-else" })], [], [], NOW);
    expect(touch.source).toBe("recorded");
  });

  it("ignores all messages when the thread has no linked contact", () => {
    const touch = effectiveTouch(thread({ contact_id: null }), [message()], [], [], NOW);
    expect(touch.source).toBe("recorded");
  });

  it("counts a submitted render but not an unsubmitted one", () => {
    const unsent = effectiveTouch(thread(), [], [render({ submitted_at: null })], [], NOW);
    expect(unsent.source).toBe("recorded");

    const sent = effectiveTouch(thread(), [], [render({ submitted_at: daysBefore(3) })], [], NOW);
    expect(sent.source).toBe("render");
  });

  it("treats a future timestamp as a data-entry slip, not evidence", () => {
    const touch = effectiveTouch(thread(), [message({ sent_at: hoursAfter(48) })], [], [], NOW);
    expect(touch.source).toBe("recorded");
  });

  it("counts a meeting that has already ended", () => {
    const touch = effectiveTouch(thread(), [], [], [meeting({ ends_at: daysBefore(1) })], NOW);
    expect(touch.source).toBe("meeting");
  });
});

describe("findDecayed", () => {
  const touchesFor = (threads: ThreadRow[], messages: MessageRow[] = []) =>
    new Map<string, Touch>(
      threads.map((t) => [t.id, effectiveTouch(t, messages, [], [], NOW)])
    );

  it("applies a shorter fuse to Offer than to Applied", () => {
    expect(decayThresholdFor("Offer")).toBeLessThan(decayThresholdFor("Applied"));
    expect(decayThresholdFor("Interviewing")).toBeLessThan(decayThresholdFor("Applied"));
    expect(decayThresholdFor("Cooling")).toBeGreaterThan(decayThresholdFor("Applied"));
  });

  it("decays a five-day-old Offer but not a five-day-old application", () => {
    const threads = [
      thread({ id: "offer", stage: "Offer", last_touch_date: daysBefore(5).slice(0, 10) }),
      thread({ id: "applied", stage: "Applied", last_touch_date: daysBefore(5).slice(0, 10) }),
    ];
    const decayed = findDecayed(threads, touchesFor(threads), new Set(), NOW);
    expect(decayed.map((d) => d.thread.id)).toEqual(["offer"]);
    expect(decayed[0].reason).toBe("offer_silence");
    expect(decayed[0].severity).toBe("urgent");
  });

  it("never decays a closed thread", () => {
    const threads = [thread({ stage: "Closed", last_touch_date: daysBefore(90).slice(0, 10) })];
    expect(findDecayed(threads, touchesFor(threads), new Set(), NOW)).toHaveLength(0);
  });

  it("does not decay a thread with something already booked", () => {
    const threads = [thread({ last_touch_date: daysBefore(40).slice(0, 10) })];
    const touches = touchesFor(threads);
    expect(findDecayed(threads, touches, new Set(), NOW)).toHaveLength(1);
    expect(findDecayed(threads, touches, new Set(["t1"]), NOW)).toHaveLength(0);
  });

  it("does not decay a thread whose evidence is newer than its recorded date", () => {
    const threads = [thread({ last_touch_date: daysBefore(30).slice(0, 10) })];
    const withMessage = touchesFor(threads, [message({ sent_at: daysBefore(1) })]);
    expect(findDecayed(threads, withMessage, new Set(), NOW)).toHaveLength(0);
  });

  it("sorts the quietest thread first", () => {
    const threads = [
      thread({ id: "a", last_touch_date: daysBefore(12).slice(0, 10) }),
      thread({ id: "b", last_touch_date: daysBefore(40).slice(0, 10) }),
      thread({ id: "c", last_touch_date: daysBefore(25).slice(0, 10) }),
    ];
    const decayed = findDecayed(threads, touchesFor(threads), new Set(), NOW);
    expect(decayed.map((d) => d.thread.id)).toEqual(["b", "c", "a"]);
  });
});

describe("findLooseEnds", () => {
  const contacts = new Map<string, ContactRow>([
    ["c1", { id: "c1", name: "Elisa", org: "SaltClick", preferred_channel: "email" }],
  ]);

  it("flags a render that was never submitted, once past its grace period", () => {
    const ends = findLooseEnds([thread()], contacts, [], [render({ created_at: daysBefore(10) })], [], NOW);
    expect(ends.some((e) => e.kind === "unsent_render")).toBe(true);
  });

  it("leaves a freshly rendered resume alone", () => {
    const ends = findLooseEnds([thread()], contacts, [], [render({ created_at: daysBefore(1) })], [], NOW);
    expect(ends.some((e) => e.kind === "unsent_render")).toBe(false);
  });

  it("ignores a render that did go out", () => {
    const sent = render({ created_at: daysBefore(10), submitted_at: daysBefore(9) });
    const ends = findLooseEnds([thread()], contacts, [], [sent], [], NOW);
    expect(ends.some((e) => e.kind === "unsent_render")).toBe(false);
  });

  it("flags a meeting with no follow-up sent since", () => {
    const ends = findLooseEnds([thread()], contacts, [], [], [meeting({ ends_at: daysBefore(2) })], NOW);
    const gap = ends.find((e) => e.kind === "follow_up_gap");
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe("urgent");
    expect(gap?.contactId).toBe("c1");
  });

  it("clears the follow-up gap once a message goes out after the meeting", () => {
    const ends = findLooseEnds(
      [thread()],
      contacts,
      [message({ sent_at: daysBefore(1) })],
      [],
      [meeting({ ends_at: daysBefore(2) })],
      NOW
    );
    expect(ends.some((e) => e.kind === "follow_up_gap")).toBe(false);
  });

  it("does not chase a meeting that only just ended", () => {
    const ends = findLooseEnds([thread()], contacts, [], [], [meeting({ ends_at: hoursAfter(-2) })], NOW);
    expect(ends.some((e) => e.kind === "follow_up_gap")).toBe(false);
  });

  it("flags a live thread with no next action, but not a closed one", () => {
    const ends = findLooseEnds(
      [
        thread({ id: "live", next_action: null }),
        thread({ id: "done", stage: "Closed", next_action: null }),
      ],
      contacts,
      [],
      [],
      [],
      NOW
    );
    const flagged = ends.filter((e) => e.kind === "no_next_action").map((e) => e.threadId);
    expect(flagged).toEqual(["live"]);
  });

  it("ranks a missing follow-up above an unsent render", () => {
    const ends = findLooseEnds(
      [thread({ next_action: null })],
      contacts,
      [],
      [render({ created_at: daysBefore(10) })],
      [meeting({ ends_at: daysBefore(2) })],
      NOW
    );
    expect(ends[0].kind).toBe("follow_up_gap");
    expect(ends.map((e) => e.kind)).toContain("unsent_render");
  });
});

describe("computeRhythm", () => {
  it("counts from Monday of the current week", () => {
    // 2026-09-11 is a Friday.
    expect(startOfWeek(NOW).toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  it("counts this week's work and ignores last week's", () => {
    const rhythm = computeRhythm(
      [thread({ created_at: daysBefore(1) }), thread({ id: "old", created_at: daysBefore(30) })],
      [message({ sent_at: daysBefore(1) }), message({ sent_at: daysBefore(20) })],
      [render({ submitted_at: daysBefore(2) }), render({ id: "r2", submitted_at: null })],
      [meeting({ ends_at: daysBefore(1) })],
      NOW
    );
    expect(rhythm).toMatchObject({
      messages: 1,
      applications: 1,
      threadsOpened: 1,
      meetings: 1,
      since: "2026-09-07",
    });
  });
});

describe("findCommitments", () => {
  it("returns only what is inside the window, soonest first", () => {
    const meetings = [
      meeting({ id: "later", starts_at: hoursAfter(30), ends_at: hoursAfter(31) }),
      meeting({ id: "soon", starts_at: hoursAfter(3), ends_at: hoursAfter(4) }),
      meeting({ id: "next-week", starts_at: hoursAfter(200), ends_at: hoursAfter(201) }),
      meeting({ id: "past", starts_at: daysBefore(1), ends_at: daysBefore(1) }),
    ];
    const commitments = findCommitments(meetings, [thread()], NOW);
    expect(commitments.map((c) => c.meetingId)).toEqual(["soon", "later"]);
  });

  it("carries the company through from the matched thread", () => {
    const commitments = findCommitments(
      [meeting({ starts_at: hoursAfter(3), ends_at: hoursAfter(4) })],
      [thread()],
      NOW
    );
    expect(commitments[0].company).toBe("SaltClick");
    expect(commitments[0].hoursAway).toBe(3);
  });
});
