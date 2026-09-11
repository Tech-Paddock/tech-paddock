import type { GraphEvent } from "@/lib/graph";
import type { ContactRow, MeetingRow, ThreadRow } from "@/lib/signals";

/**
 * Match calendar events to pipeline threads, deterministically.
 *
 * No model call. The same reasoning as the resume labeller: the rules cover the
 * real cases, a model would be non-deterministic, and a dashboard that suggests
 * a different thing on each refresh is not one you would trust. Every match
 * carries the reason it matched, so a wrong one is visible rather than magic.
 *
 * The strongest signal is the attendee's email domain — an invite from
 * someone@saltclick.com is about SaltClick with very little room for doubt.
 * Everything below that is corroboration.
 */

export type MeetingMatch = {
  meeting: MeetingRow;
  threadId: string | null;
  score: number;
  /** Why it matched, in words, for the UI to show. */
  reason: string | null;
  /** Two threads scored equally; matching either would be a guess. */
  ambiguous: boolean;
};

/** Domains that say nothing about which company a meeting is with. */
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "msn.com",
]);

/** Legal and filler suffixes that differ between a company name and its domain. */
const NAME_NOISE = /\b(inc|llc|ltd|limited|corp|corporation|co|company|group|holdings|the)\b/g;

/** Below this length a containment match is a coincidence, not a signal. */
const MIN_SLUG_LENGTH = 4;

const SCORE_DOMAIN = 3;
const SCORE_SUBJECT = 2;
const SCORE_CONTACT_NAME = 2;
const SCORE_LOCATION = 1;

/** Accept at this score or above; below it, leave the event unmatched. */
export const MATCH_THRESHOLD = 2;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(NAME_NOISE, " ")
    .replace(/[^a-z0-9]+/g, "");
}

/** `mail.saltclick.co.uk` → `saltclick`. */
export function domainRoot(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const host = email.slice(at + 1).toLowerCase();
  if (!host || GENERIC_DOMAINS.has(host)) return null;

  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  // Drop the public suffix, allowing for two-part suffixes like co.uk.
  const secondLevel = parts[parts.length - 2];
  const root =
    secondLevel.length <= 3 && parts.length >= 3 ? parts[parts.length - 3] : secondLevel;
  return slugify(root) || null;
}

function slugsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < MIN_SLUG_LENGTH || b.length < MIN_SLUG_LENGTH) return false;
  return a.includes(b) || b.includes(a);
}

function mentions(haystack: string | null, slug: string): boolean {
  if (!haystack || slug.length < MIN_SLUG_LENGTH) return false;
  return slugify(haystack).includes(slug);
}

type Scored = { threadId: string; score: number; reason: string };

function scoreThread(
  event: GraphEvent,
  thread: ThreadRow,
  contacts: Map<string, ContactRow>
): Scored | null {
  const companySlug = slugify(thread.company);
  if (!companySlug) return null;

  let score = 0;
  const reasons: string[] = [];

  const domains = [event.organizerEmail, ...event.attendeeEmails]
    .filter((e): e is string => !!e)
    .map(domainRoot)
    .filter((d): d is string => !!d);

  if (domains.some((d) => slugsOverlap(d, companySlug))) {
    score += SCORE_DOMAIN;
    reasons.push(`an attendee is at ${thread.company}`);
  }

  if (mentions(event.subject, companySlug)) {
    score += SCORE_SUBJECT;
    reasons.push("the invite names the company");
  }

  const contact = thread.contact_id ? contacts.get(thread.contact_id) : undefined;
  if (contact) {
    const contactSlug = slugify(contact.name);
    const names = [event.organizerName, ...event.attendeeNames].filter((n): n is string => !!n);
    if (contactSlug.length >= MIN_SLUG_LENGTH && names.some((n) => slugify(n) === contactSlug)) {
      score += SCORE_CONTACT_NAME;
      reasons.push(`${contact.name} is on the invite`);
    }
  }

  if (mentions(event.location, companySlug)) {
    score += SCORE_LOCATION;
    reasons.push("the location names the company");
  }

  if (score === 0) return null;
  return { threadId: thread.id, score, reason: reasons.join(", ") };
}

export function matchMeetings(
  events: GraphEvent[],
  threads: ThreadRow[],
  contacts: Map<string, ContactRow>
): MeetingMatch[] {
  return events.map((event) => {
    const scored = threads
      .map((t) => scoreThread(event, t, contacts))
      .filter((s): s is Scored => !!s)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const accepted = best && best.score >= MATCH_THRESHOLD;
    // A tie at the top means either answer is a coin flip. Better to show the
    // event unattached than to attach it to the wrong company.
    const ambiguous = !!accepted && scored.length > 1 && scored[1].score === best.score;

    const meeting: MeetingRow = {
      id: event.id,
      thread_id: accepted && !ambiguous ? best.threadId : null,
      subject: event.subject,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      organizer_email: event.organizerEmail,
    };

    return {
      meeting,
      threadId: meeting.thread_id,
      score: best?.score ?? 0,
      reason: accepted && !ambiguous ? best.reason : null,
      ambiguous,
    };
  });
}
