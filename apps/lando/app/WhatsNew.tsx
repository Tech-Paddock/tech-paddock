import { shownReleases } from "@/lib/releases";

/** "2026-10-27" as "Oct 27", built from its parts so no time zone can shift the day. */
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The What's new tab (TEC-182): the latest changes in plain words. Static text, no fetch. */
export default function WhatsNew() {
  return (
    <section className="grid gap-2">
      <h2 className="text-base font-bold">What&apos;s new</h2>
      <ul className="grid gap-2">
        {shownReleases().map((r, i) => (
          <li key={i} className="grid gap-0.5 rounded-[14px] border border-line bg-surface p-3">
            <time dateTime={r.date} className="text-sm tabular-nums text-ink-soft">
              {dayLabel(r.date)}
            </time>
            <p className="text-[15px]">{r.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
