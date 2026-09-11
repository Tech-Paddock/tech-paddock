import { describe, expect, it } from "vitest";
import type { GraphEvent } from "@/lib/graph";
import { domainRoot, matchMeetings, slugify } from "@/lib/matchMeetings";
import type { ContactRow, ThreadRow } from "@/lib/signals";

function thread(over: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: "t1",
    contact_id: null,
    company: "Fabrikam",
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
    expect(slugify("Contoso Cloud")).toBe("contosocloud");
    expect(slugify("Tailspin, Inc.")).toBe("tailspin");
    expect(slugify("Litware Growth LLC")).toBe("litwaregrowth");
  });
});

describe("domainRoot", () => {
  it("pulls the company out of an address", () => {
    expect(domainRoot("robin@fabrikam.com")).toBe("fabrikam");
    expect(domainRoot("someone@mail.contosocloud.org")).toBe("contosocloud");
  });

  it("handles two-part public suffixes", () => {
    expect(domainRoot("someone@tailspin.co.uk")).toBe("tailspin");
  });

  it("refuses to read a company out of a free-mail address", () => {
    expect(domainRoot("joel@gmail.com")).toBeNull();
    expect(domainRoot("joel@outlook.com")).toBeNull();
  });
});

describe("matchMeetings", () => {
  it("matches on the attendee's email domain alone", () => {
    const [match] = matchMeetings(
      [event({ attendeeEmails: ["robin@fabrikam.com"] })],
      [thread()],
      noContacts
    );
    expect(match.threadId).toBe("t1");
    expect(match.reason).toContain("Fabrikam");
  });

  it("matches when the invite names the company", () => {
    const [match] = matchMeetings(
      [event({ subject: "Fabrikam — second round" })],
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
      ["c1", { id: "c1", name: "Robin Marsh", org: "Fabrikam", preferred_channel: "email" }],
    ]);
    const [match] = matchMeetings(
      [event({ attendeeNames: ["Robin Marsh"] })],
      [thread({ contact_id: "c1" })],
      contacts
    );
    expect(match.threadId).toBe("t1");
    expect(match.reason).toContain("Robin Marsh");
  });

  it("refuses to guess between two threads at the same company", () => {
    // Two open roles at one employer is an ordinary situation, and an invite
    // from that company is evidence for both threads equally.
    const threads = [
      thread({ id: "role-a", company: "Proseware" }),
      thread({ id: "role-b", company: "Proseware" }),
    ];
    const [match] = matchMeetings(
      [event({ attendeeEmails: ["recruiter@proseware.example"] })],
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
      thread({ id: "strong", company: "Fabrikam" }),
    ];
    const [match] = matchMeetings(
      [event({ subject: "Sync", attendeeEmails: ["robin@fabrikam.com"] })],
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
