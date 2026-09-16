"use client";

import type { Glance, SummaryItem } from "@/lib/glance";
import { isStale } from "@/lib/glance";

/**
 * The Morning Paper. Design approved by Joel on 2026-09-16.
 *
 * **There is no fold, and that is a change to a settled decision.** DECISIONS.md
 * still records "above the fold carries no job-search content at all — a privacy
 * requirement, because two days a week the screen is in an office". Joel lifted
 * it: *"drop above the fold below, ill manage privacy."* So the page no longer
 * enforces a privacy boundary in its layout, and what is owed — job search
 * included — leads, which is what the rest of that same decision asks for.
 *
 * That amendment is his to make and needs recording in DECISIONS.md; this
 * comment is not the record, only a pointer to why the code stopped matching it.
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

export type Density = "dispatch" | "timing";

export const DENSITIES: { id: Density; name: string; note: string }[] = [
  { id: "dispatch", name: "Dispatch", note: "Room to read" },
  { id: "timing", name: "Timing", note: "Everything at once" },
];

/** Long form, and deliberately not abbreviated — this is the masthead. */
function today() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
}: {
  count: number;
  name: string;
  top: SummaryItem | null;
}) {
  return (
    <div className="paper-figure">
      <span className="paper-figure-count">{count}</span>
      <span className="paper-figure-name">{name}</span>
      <span className="paper-figure-top">
        {top ? top.label : count === 0 ? "nothing outstanding" : "no single one stands out"}
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
  // quieter one — so both raise the banner. An earlier version keyed it on
  // staleness alone, and a tool that was entirely absent said nothing at all.
  const stale = glance.sources.filter((s) => isStale(s));
  const silent = stale.length + glance.unavailable.length;
  const owed = glance.commitments;

  return (
    <article className={`paper paper-${density}`}>
      <header className="paper-masthead">
        <p className="paper-date">{today()}</p>
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
              {glance.unavailable.length > 0
                ? "Not reported — the source did not answer."
                : "Nothing owed."}
            </p>
          )}

          <Figure count={glance.decay.count} name="gone quiet" top={glance.decay.top} />
          <Figure count={glance.looseEnds.count} name="loose ends" top={glance.looseEnds.top} />
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
          {glance.unavailable.map((tool) => (
            <p key={tool} className="paper-source paper-stale">
              <span className="paper-source-name">{tool}</span>
              <span className="paper-source-when">did not answer at all</span>
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
          {silent === 1 ? "A source is" : `${silent} sources are`} silent or past three times the
          expected cadence. What is shown above may be old or missing, and this page will not guess
          which.
        </p>
      )}
    </article>
  );
}
