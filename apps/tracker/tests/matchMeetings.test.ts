import { describe, expect, it } from "vitest";
import type { GraphEvent } from "@/lib/graph";
import { domainRoot, matchMeetings, slugify } from "@/lib/matchMeetings";
import type { ContactRow, ThreadRow } from "@/lib/signals";

function thread(over: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: "t1",
    contact_id: null,
    company: "SaltClick",
    stage: "Applied",
    last_touch_date: "2026-09-01",
    next_action: null,
    notes: null,
    open_task_id: null,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function event(over: Partial<GraphEvent> = {}): GraphEvent {
  return {
    id: "e1",
    subject: "Intro call",
    startsAt: "2026-09-12T14:00:00Z",
    endsAt: "2026-09-12T15:00:00Z",
    isAllDay: false,
    organizerEmail: null,
    organizerName: null,
    attendeeEmails: [],
    attendeeNames: [],
    location: null,
    ...over,
  };
}

const noContacts = new Map<string, ContactRow>();

describe("slugify", () => {
  it("strips punctuation, spacing and legal suffixes", () => {
    expect(slugify("Cloud for Good")).toBe("cloudforgood");
    expect(slugify("RedPoint, Inc.")).toBe("redpoint");
    expect(slugify("Growth Heroes LLC")).toBe("growthheroes");
  });
});

describe("domainRoot", () => {
  it("pulls the company out of an address", () => {
    expect(domainRoot("elisa@saltclick.com")).toBe("saltclick");
    expect(domainRoot("someone@mail.cloudforgood.org")).toBe("cloudforgood");
  });

  it("handles two-part public suffixes", () => {
    expect(domainRoot("someone@redpoint.co.uk")).toBe("redpoint");
  });

  it("refuses to read a company out of a free-mail address", () => {
    expect(domainRoot("joel@gmail.com")).toBeNull();
    expect(domainRoot("joel@outlook.com")).toBeNull();
  });
});

describe("matchMeetings", () => {
  it("matches on the attendee's email domain alone", () => {
    const [match] = matchMeetings(
      [event({ attendeeEmails: ["elisa@saltclick.com"] })],
      [thread()],
      noContacts
    );
    expect(match.threadId).toBe("t1");
    expect(match.reason).toContain("SaltClick");
  });

  it("matches when the invite names the company", () => {
    const [match] = matchMeetings(
      [event({ subject: "SaltClick — second round" })],
      [thread()],
      noContacts
    );
    expect(match.threadId).toBe("t1");
  });

  it("leaves an unrelated event unattached", () => {
    const [match] = matchMeetings(
      [event({ subject: "Dentist", attendeeEmails: ["front.desk@smilecare.example"] })],
      [thread()],
      noContacts
    );
    expect(match.threadId).toBeNull();
    expect(match.score).toBe(0);
  });

  it("does not match on a free-mail domain", () => {
    const [match] = matchMeetings(
      [event({ attendeeEmails: ["someone@gmail.com"] })],
      [thread()],
      noContacts
    );
    expect(match.threadId).toBeNull();
  });

  it("uses the linked contact's name as corroboration", () => {
    const contacts = new Map<string, ContactRow>([
      ["c1", { id: "c1", name: "Elisa Salina", org: "SaltClick", preferred_channel: "email" }],
    ]);
    const [match] = matchMeetings(
      [event({ attendeeNames: ["Elisa Salina"] })],
      [thread({ contact_id: "c1" })],
      contacts
    );
    expect(match.threadId).toBe("t1");
    expect(match.reason).toContain("Elisa Salina");
  });

  it("refuses to guess between two threads at the same company", () => {
    // Two open roles at one employer is an ordinary situation, and an invite
    // from that company is evidence for both threads equally.
    const threads = [
      thread({ id: "role-a", company: "Attain" }),
      thread({ id: "role-b", company: "Attain" }),
    ];
    const [match] = matchMeetings(
      [event({ attendeeEmails: ["recruiter@attain.example"] })],
      threads,
      noContacts
    );
    expect(match.ambiguous).toBe(true);
    expect(match.threadId).toBeNull();
    // Still a commitment, just without a thread to hang context off.
    expect(match.meeting.subject).toBe("Intro call");
  });

  it("prefers the domain match over a weaker name collision", () => {
    const threads = [
      thread({ id: "weak", company: "Click Studios" }),
      thread({ id: "strong", company: "SaltClick" }),
    ];
    const [match] = matchMeetings(
      [event({ subject: "Sync", attendeeEmails: ["elisa@saltclick.com"] })],
      threads,
      noContacts
    );
    expect(match.threadId).toBe("strong");
  });

  it("keeps the event as a commitment even when nothing matches", () => {
    const [match] = matchMeetings([event({ subject: "Standup" })], [thread()], noContacts);
    expect(match.meeting.thread_id).toBeNull();
    expect(match.meeting.subject).toBe("Standup");
    expect(match.meeting.starts_at).toBe("2026-09-12T14:00:00Z");
  });
});
