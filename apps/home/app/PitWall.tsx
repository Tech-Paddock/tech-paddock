"use client";

import { useMemo, useState } from "react";
import type { PitSource, PitState, PitWall as PitWallData } from "@/lib/pitwall";
import { filterItems } from "@/lib/pitfilter";

/**
 * The board.
 *
 * Ordered by *who is blocked*, never by recency or by source — an old blocker
 * deserves more prominence than a new one, not less. Filtering is client-side
 * because the whole set is already on the page: the server sent everything it
 * could reach, so narrowing it must never mean another round trip.
 */

const LABEL: Record<PitState, string> = { box: "BOX", agent: "AGENT", clear: "CLEAR" };

function age(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function PitWall({ data }: { data: PitWallData }) {
  const [state, setState] = useState<"" | PitState>("");
  const [source, setSource] = useState<"" | PitSource>("");
  const [agent, setAgent] = useState("");

  const rows = useMemo(() => filterItems(data.items, { state, source, agent }), [data.items, state, source, agent]);

  const count = (s: PitState) => rows.filter((r) => r.state === s).length;
  const sources = Array.from(new Set(data.items.map((i) => i.source))).sort();

  return (
    <section className="pitwall">
      <div className="pit-head">
        <h2>Pit wall</h2>
        <p className="pit-asof">
          Live sources read {age(data.readAt)} · repo prose baked at the last deploy,{" "}
          {age(data.bakedAt)}
        </p>
      </div>

      <div className="pit-strip">
        {data.agents.map((a) => (
          <button
            key={a.id}
            type="button"
            className="pit-car"
            aria-pressed={agent === a.id}
            onClick={() => setAgent(agent === a.id ? "" : a.id)}
          >
            <span className="pit-car-name">{a.name}</span>
            <span className="pit-car-seen" title="The State as of line of this agent's handoff">
              {a.asOf ? `handoff ${a.asOf}` : "—"}
            </span>
          </button>
        ))}
      </div>

      <div className="pit-filters">
        <label className="pit-f" htmlFor="pit-state">
          State
          <select id="pit-state" value={state} onChange={(e) => setState(e.target.value as PitState | "")}>
            <option value="">all</option>
            <option value="box">box</option>
            <option value="agent">agent</option>
            <option value="clear">clear</option>
          </select>
        </label>
        <label className="pit-f" htmlFor="pit-source">
          Source
          <select id="pit-source" value={source} onChange={(e) => setSource(e.target.value as PitSource | "")}>
            <option value="">all</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="pit-tally">
          {count("box")} box · {count("agent")} agent · {count("clear")} clear
        </span>
      </div>

      <div className="pit-rows">
        {rows.length === 0 ? (
          <p className="pit-empty">Nothing matches that filter.</p>
        ) : (
          rows.map((i, n) => (
            <div className={`pit-row pit-${i.state}`} key={`${i.source}-${i.ref}-${n}`}>
              <span className="pit-pill">{LABEL[i.state]}</span>
              <span className="pit-what">
                <b>{i.title}</b>
                {i.detail ? <span>{i.detail}</span> : null}
                <span className="pit-meta">
                  <span className="pit-tag pit-src">{i.source}</span>
                  <span className="pit-tag">{i.ref}</span>
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {data.unavailable.length > 0 && (
        <div className="pit-unavailable">
          <p className="pit-unavailable-title">Not reported</p>
          <ul>
            {data.unavailable.map((u, n) => (
              <li key={`${u.source}-${n}`}>
                <span className="pit-tag pit-src">{u.source}</span> {u.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
