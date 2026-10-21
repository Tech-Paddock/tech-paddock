/**
 * The phone's clock, never the server's. "Today" starts at the phone's local
 * midnight; the home-screen app is resumed from memory the next morning, so it
 * is recomputed whenever the page comes back into view.
 */
export function localMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO time as the value of an `<input type="datetime-local">`, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The reverse; null for an empty or unreadable input. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * A `datetime-local` value as a short label for the form's When field:
 * "Today 9:05 PM", "Yesterday 7:30 AM", "Oct 19 6:00 PM". The native control
 * is wide (Chrome clips it at phone widths and it pushed into Human), so the
 * form shows this instead and keeps the real input, transparent, over it.
 * Empty for an unreadable value.
 */
export function whenLabel(value: string, now: Date): string {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Calendar days, not elapsed hours, so a DST change cannot move the label.
  const days = Math.round((localMidnight(now).getTime() - localMidnight(d).getTime()) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  const date = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "2-digit" } : {}),
  });
  return `${date} ${time}`;
}
