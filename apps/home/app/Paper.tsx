"use client";

import type { Glance, SummaryItem } from "@/lib/glance";
import { isStale, nothingAnswered } from "@/lib/glance";
import type { Density } from "./Landing";

/**
 * The Morning Paper. Design approved by Joel on 2026-09-16.
 *
 * **There is no fold.** Joel lifted it the same day — *"drop above the fold
 * below, ill manage privacy"* — and `DECISIONS.md` records it. What is owed,
 * job search included, leads the page. Do not reintroduce a fold as a safety
 * feature.
 *
 * **A count the hub never received is "—", never 0.** Zero is an answer; the
 * page used to print "0 gone quiet — nothing outstanding" for a request it had
 * not made, next to a small line admitting the source did not answer.
 *
 * **It leads with what is owed, not what arrived.** Threads gone quiet are a
 * task and get names; replies received are a statistic and get a number. That is
 * why the arrived column is deliberately the boring one.
 *
 * **Stale is loud.** Past three cadences a source is struck through and the page
 * banners itself. A timestamp nobody reads is not the fix.
 *
 * **Two densities, one markup tree.** Dispatch and Timing are the same elements
 * with a different class on the root; nothing is conditionally rendered between
 * them. Density is deliberately not polarity: polarity is one site-wide
 * preference shared by cookie across every app, density is local to this page.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Long form, and deliberately not abbreviated — this is the masthead.
 *
 * **Written out rather than handed to `toLocaleDateString`, and that is the fix
 * for a real bug.** The `en-GB` formatter does not agree with itself across
 * runtimes: Node rendered "Friday, 18 September 2026" and the browser rendered
 * the same string without the comma, so every load mismatched on hydration and
 * React dropped this whole Suspense boundary to client rendering. One comma.
 *
 * An explicit table cannot disagree with itself, so the server and the browser
 * now produce the same characters from the same date.
 *
 * **What is still allowed to differ is the date itself**, because the server
 * reads UTC and the browser reads local time — within a few hours of midnight
 * they are genuinely different days, and neither is wrong. That one element
 * carries `suppressHydrationWarning` so the browser's answer wins quietly. It
 * is scoped to the date and nothing else; it is not covering for the formatter.
 */
function today() {
  const d = new Date();
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function Owed({ item }: { item: SummaryItem }) {
  return (
    <a className={`paper-owed sev-${item.severity}`} href={item.href}>
      <span className="paper-owed-label">{item.severity}</span>
      <span className="paper-owed-body">
        <span className="paper-owed-title">{item.label}</span>
        {item.detail && <span className="paper-owed-detail">{item.detail}</span>}
      </span>
    </a>
  );
}

/**
 * A counted thing. The charter's rule is counts and singles, never rows — so a
 * figure, and at most the one example that earned the top slot.
 */
function Figure({
  count,
  name,
  top,
  unknown,
  partial,
}: {
  count: number;
  name: string;
  top: SummaryItem | null;
  /** No source answered, so there is no count — only a reason. */
  unknown: string | null;
  /** Some sources did not answer, so this is a floor rather than a total. */
  partial: boolean;
}) {
  if (unknown) {
    return (
      <div className="paper-figure">
        <span className="paper-figure-count">—</span>
        <span className="paper-figure-name">{name}</span>
        <span className="paper-figure-top">not reported — {unknown}</span>
      </div>
    );
  }
  return (
    <div className="paper-figure">
      <span className="paper-figure-count">{count}</span>
      <span className="paper-figure-name">{partial ? `${name}, at least` : name}</span>
      <span className="paper-figure-top">
        {top
          ? top.label
          : count > 0
            ? "no single one stands out"
            : partial
              ? "none from the sources that answered"
              : "nothing outstanding"}
      </span>
    </div>
  );
}

export default function Paper({
  glance,
  density,
}: {
  glance: Glance;
  density: Density;
}) {
  // A source that never answered is a louder case than a stale one, not a
  // quieter one — so both raise the banner, and so does one that answered with
  // gaps. An earlier version keyed it on staleness alone, and a tool that was
  // entirely absent said nothing at all.
  const stale = glance.sources.filter((s) => isStale(s));
  const silent = stale.length + glance.unavailable.length + glance.degraded.length;
  const owed = glance.commitments;
  const unknown = nothingAnswered(glance)
    ? glance.unavailable.map((u) => `${u.tool}: ${u.why}`).join("; ") || "no source configured"
    : null;
  const partial = glance.unavailable.length > 0;

  return (
    <article className={`paper paper-${density}`}>
      <header className="paper-masthead">
        <p className="paper-date" suppressHydrationWarning>{today()}</p>
        <h1>The Morning Paper</h1>
      </header>

      {/* What is owed leads the page, job search included. The privacy split
          that used to sit above this is gone at Joel's instruction — he manages
          that himself rather than having the layout do it for him. */}
      <section className="paper-below" aria-label="The day">
        <div className="paper-column">
          <h2 className="paper-head">Owed</h2>
          {owed.length > 0 ? (
            <div className="paper-owed-list">
              {owed.map((item) => (
                <Owed key={`${item.label}-${item.href}`} item={item} />
              ))}
              {glance.commitmentOverflow > 0 && (
                <p className="paper-note">and {glance.commitmentOverflow} more, in the tracker</p>
              )}
            </div>
          ) : (
            <p className="paper-note">
              {unknown
                ? `Not reported — ${unknown}.`
                : partial
                  ? "Nothing owed from the sources that answered."
                  : "Nothing owed."}
            </p>
          )}

          <Figure
            count={glance.decay.count}
            name="gone quiet"
            top={glance.decay.top}
            unknown={unknown}
            partial={partial}
          />
          <Figure
            count={glance.looseEnds.count}
            name="loose ends"
            top={glance.looseEnds.top}
            unknown={unknown}
            partial={partial}
          />

          {/* A tool telling the hub it is not set up — a missing key, an
              integration never connected. Owed in its own way, so it sits here
              rather than among the statistics. */}
          {glance.health.length > 0 && (
            <>
              <h2 className="paper-head">Needs setup</h2>
              <div className="paper-owed-list">
                {glance.health.map((item) => (
                  <Owed key={`${item.label}-${item.href}`} item={item} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="paper-column">
          <h2 className="paper-head">Arrived</h2>
          <p className="paper-note">
            Statistics, by decision. What came back is worth a number; what is owed is worth a name.
          </p>
          {glance.rhythm.length > 0 ? (
            glance.rhythm.map((r) => (
              <div key={r.label} className="paper-figure">
                <span className="paper-figure-name">{r.label}</span>
                <span className="paper-figure-top">{r.detail ?? "—"}</span>
              </div>
            ))
          ) : (
            <p className="paper-note">Not reported.</p>
          )}

          <h2 className="paper-head">Sources</h2>
          {/* Stale is loud: struck through and said out loud, not a timestamp
              in small grey type that nobody reads. */}
          {glance.sources.length === 0 && glance.unavailable.length === 0 && (
            <p className="paper-note">No source configured.</p>
          )}
          {glance.sources.map((s) => (
            <p key={s.tool} className={`paper-source ${isStale(s) ? "paper-stale" : ""}`}>
              <span className="paper-source-name">{s.tool}</span>
              <span className="paper-source-when">
                {!s.generatedAt
                  ? "answered without saying when"
                  : isStale(s)
                    ? `stale — last spoke ${new Date(s.generatedAt).toUTCString()}`
                    : `current as of ${new Date(s.generatedAt).toUTCString()}`}
              </span>
            </p>
          ))}
          {glance.unavailable.map((u) => (
            <p key={u.tool} className="paper-source paper-stale">
              <span className="paper-source-name">{u.tool}</span>
              <span className="paper-source-when">did not answer — {u.why}</span>
            </p>
          ))}
          {glance.degraded.map((d) => (
            <p key={d} className="paper-source paper-degraded">
              <span className="paper-source-when">{d}</span>
            </p>
          ))}
        </div>
      </section>

      {/* Everything the tracker does not know about. Still undefined: it was the
          lead when the page had a fold, and it keeps its place in the tree
          rather than being deleted, because it is a question Joel has open
          rather than one that has been answered no. */}
      <section className="paper-deferred" aria-label="Off the tracker">
        <div className="paper-slot">
          <p className="paper-slot-label">Everything else you owe</p>
          <p className="paper-slot-body">
            What is owed that no tool here knows about. The shape is settled — owed things get
            names — but nothing in the repo says where they come from.
          </p>
          <p className="paper-slot-ask">Needs a source, or a decision that there is not one.</p>
        </div>
      </section>

      {silent > 0 && (
        <p className="paper-banner">
          {silent === 1 ? "One source warning" : `${silent} source warnings`} — silent, past three
          times the expected cadence, or answering with gaps. What is shown above may be old or
          missing, and this page will not guess which.
        </p>
      )}
    </article>
  );
}
