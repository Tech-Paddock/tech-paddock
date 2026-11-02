/**
 * What the header says about the live King Soopers check (TEC-211). **Pure, and
 * the only part of the check a client component imports**: `lib/krogerCheck.ts`
 * pulls in the Kroger client, which stays on the server.
 */

export type CheckState = "connected" | "expired" | "unreachable" | "not-connected" | "not-set-up";

export type CheckResult = {
  state: CheckState;
  /** When the check finished, ISO. */
  checkedAt: string;
  /** In words, for a state that needs one; never a token. */
  detail: string | null;
  /** For `not-set-up`: which variable is missing. */
  problems: string[];
};

/** "2:14 PM", for when a check ran. Falls back to the text it was given. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export type CheckLine = {
  tone: "good" | "bad" | "warn" | "plain";
  /** The state in words, always shown beside the dot: colour is never the only cue. */
  word: string;
  /** What follows it, small. */
  rest: string | null;
  /** The link beside it, if any. */
  action: { label: string; href: string } | null;
};

/**
 * What the header says for a check. `lastWorked` is when a check last passed
 * (this browser remembers it), for "Can't reach King Soopers".
 */
export function checkLine(check: CheckResult | null, lastWorked: string | null, time: (iso: string) => string = clock): CheckLine {
  if (!check) return { tone: "plain", word: "Checking King Soopers…", rest: null, action: null };
  switch (check.state) {
    case "connected":
      return { tone: "good", word: "Connected", rest: `checked ${time(check.checkedAt)}`, action: null };
    case "expired":
      return { tone: "bad", word: "Sign-in expired", rest: null, action: { label: "Reconnect", href: "/kroger/connect" } };
    case "unreachable":
      return { tone: "warn", word: "Can't reach King Soopers", rest: lastWorked ? `last worked ${time(lastWorked)}` : "no good check yet", action: null };
    case "not-connected":
      return { tone: "plain", word: "Not connected", rest: null, action: { label: "Connect King Soopers", href: "/kroger/connect" } };
    case "not-set-up":
      return { tone: "plain", word: "Not set up", rest: null, action: null };
  }
}
