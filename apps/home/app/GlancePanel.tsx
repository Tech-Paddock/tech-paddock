import type { Glance, SummaryItem } from "@/lib/glance";
import { isQuiet, nothingAnswered } from "@/lib/glance";

/**
 * Counts and singles, never lists.
 *
 * Every row is a link into the tool that owns the work, so the hub routes you
 * somewhere you can act rather than describing a situation you then have to go
 * find. The one number with no link is the rhythm line, because there is
 * nothing to do about it except the doing.
 */

function Row({ item, label }: { item: SummaryItem; label: string }) {
  return (
    <a className={`slot sev-${item.severity}`} href={item.href}>
      <span className="slot-label">{label}</span>
      <span className="slot-body">
        <span className="slot-title">{item.label}</span>
        {item.detail && <span className="slot-detail">{item.detail}</span>}
      </span>
      <span className="slot-go" aria-hidden="true">
        →
      </span>
    </a>
  );
}

function CountRow({
  label,
  count,
  noun,
  top,
}: {
  label: string;
  count: number;
  noun: string;
  top: SummaryItem | null;
}) {
  if (count === 0 || !top) return null;
  const rest = count - 1;
  return (
    <a className={`slot sev-${top.severity}`} href={top.href}>
      <span className="slot-label">{label}</span>
      <span className="slot-body">
        <span className="slot-title">{top.label}</span>
        {top.detail && <span className="slot-detail">{top.detail}</span>}
      </span>
      <span className="slot-count">
        {rest > 0 ? `+${rest} more ${rest === 1 ? noun : `${noun}s`}` : ""}
      </span>
      <span className="slot-go" aria-hidden="true">
        →
      </span>
    </a>
  );
}

export default function GlancePanel({ glance }: { glance: Glance }) {
  const quiet = isQuiet(glance);
  // Keyed on whether anything answered, not on whether a rhythm line came back —
  // a source can answer with no rhythm, and that is not "can't reach".
  const allDown = glance.unavailable.length > 0 && nothingAnswered(glance);
  const why = glance.unavailable.map((u) => `${u.tool} (${u.why})`).join(", ");

  return (
    <div className="glance">
      <p className="eyebrow">Pit wall</p>
      <h1>{allDown ? "Can't reach your tools" : quiet ? "Nothing needs you" : "Here's what's live"}</h1>

      {allDown ? (
        <p className="description">
          {why} did not answer, so nothing here is a count. The tools themselves are still
          reachable from the sidebar.
        </p>
      ) : quiet ? (
        <p className="description">
          No commitments booked, nothing gone cold, no loose ends. Open a tool when you want one.
        </p>
      ) : null}

      <div className="slots">
        {glance.commitments.map((c, i) => (
          <Row key={`commitment-${i}`} item={c} label="On the clock" />
        ))}
        {glance.commitmentOverflow > 0 && (
          <p className="slot-note">+{glance.commitmentOverflow} more on the calendar</p>
        )}

        <CountRow label="Going quiet" count={glance.decay.count} noun="thread" top={glance.decay.top} />
        <CountRow
          label="Loose ends"
          count={glance.looseEnds.count}
          noun="item"
          top={glance.looseEnds.top}
        />

        {glance.health.map((h, i) => (
          <Row key={`health-${i}`} item={h} label="Needs setup" />
        ))}

        {glance.rhythm.map((r, i) => (
          <div key={`rhythm-${i}`} className="slot sev-info slot-static">
            <span className="slot-label">This week</span>
            <span className="slot-body">
              <span className="slot-title">{r.label}</span>
              {r.detail && <span className="slot-detail">{r.detail}</span>}
            </span>
          </div>
        ))}
      </div>

      {glance.unavailable.length > 0 && !allDown && (
        <p className="slot-note">Couldn&apos;t reach {why} — what is above is only what the others said.</p>
      )}
      {glance.degraded.length > 0 && (
        <p className="slot-note">Partial data — {glance.degraded.join("; ")}</p>
      )}
    </div>
  );
}
