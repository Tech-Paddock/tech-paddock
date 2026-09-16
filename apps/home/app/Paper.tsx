"use client";

import type { Glance, SummaryItem } from "@/lib/glance";
import { isStale } from "@/lib/glance";

/**
 * The Morning Paper — PROTOTYPE, for approval before anything is proposed as
 * final. Built from the decisions already settled in .claude/DECISIONS.md, not
 * from Joel's brief, which this agent has not seen.
 *
 * Four settled things shape everything here:
 *
 * **It leads with what is owed, not what arrived.** Threads gone quiet are a
 * task and get names; replies received are a statistic and get a number. That
 * is why the arrived half of this page is deliberately the boring half.
 *
 * **Above the fold carries no job-search content at all.** Two days a week this
 * screen is in an office, so the top of the page has to be safe to be seen over
 * a shoulder. That is a hard constraint rather than a preference, and it is the
 * reason the fold is a visible rule on the page rather than an idea in someone's
 * head — a boundary you can see is one you notice breaking.
 *
 * **It extends to source names.** "Pipeline Tracker last spoke three hours ago"
 * is a job-search disclosure even though it names no company: it says there is a
 * pipeline. So no tool is named above the fold either, which is a sharper line
 * than the decision spells out and is flagged as this prototype's own reading.
 *
 * **Stale is loud.** Past three cadences a panel is struck through and says so.
 * A timestamp nobody reads is not the fix.
 *
 * **Two densities, one markup tree.** Dispatch and Timing are the same elements
 * with a different class on the root; nothing is conditionally rendered between
 * them. Density is polarity's opposite in one important way — polarity is one
 * site-wide preference shared by cookie across every app, and density is local
 * to this page. They are no longer the same switch.
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

      {/* ---------------------------------------------------------------- above
          Safe to be read over a shoulder. Nothing here may name a company, a
          role, a tool that implies a search, or a count that implies one. The
          slot below is empty on purpose: what belongs in it is the one thing
          this prototype could not derive from a settled decision. */}
      <section className="paper-above" aria-label="Above the fold">
        <div className="paper-slot">
          <p className="paper-slot-label">What is owed today</p>
          <p className="paper-slot-body">
            This is the lead, and it is deliberately blank. The decision says the Paper opens with
            what is owed and that nothing job-related may appear above the fold — which settles the
            shape of this slot but not what fills it.
          </p>
          <p className="paper-slot-ask">
            Needs the brief: what is owed that is safe to read in an office.
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------------- fold
          Drawn rather than implied. Everything past it assumes the screen is
          private, so it is worth being able to see where that assumption starts. */}
      <p className="paper-fold">
        <span>Below the fold — private</span>
      </p>

      <section className="paper-below" aria-label="Below the fold">
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
