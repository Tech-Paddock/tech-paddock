import { shownDays } from "@/lib/releases";

/** "2026-10-27" as "Oct 27", built from its parts so no time zone can shift the day. */
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * The What's new tab (TEC-182, plain text since TEC-186): for each of the latest whole days a line
 * "Oct 27 | what the day was about", then that day's updates as "•" bullets. No cards. Static text,
 * no fetch.
 */
export default function WhatsNew() {
  return (
    <section className="grid gap-4">
      <h2 className="text-base font-bold">What&apos;s new</h2>
      {shownDays().map((d) => (
        <div key={d.date} className="grid gap-1">
          <h3 className="text-[15px] font-bold">
            <time dateTime={d.date}>{dayLabel(d.date)}</time> | {d.summary}
          </h3>
          <ul className="grid gap-1 text-[15px]">
            {d.items.map((text, i) => (
              <li key={i} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-1">
                <span aria-hidden="true">•</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
