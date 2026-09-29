"use client";

import { useState } from "react";
import type { PitIssue, PitWallData } from "@/lib/linear";
import { byAgent, byStatus, needsJoel, type Grouping } from "@/lib/pitgroups";

/**
 * The Pit Wall: every open issue in Linear, team TEC, and who acts next.
 *
 * Two arrangements behind one toggle — by status, with what waits on Joel in a
 * band above the board, or by agent. The toggle regroups what is already on the
 * page, so it never asks Linear again; the choice rides in `?group=` so a
 * reload or a shared link keeps it.
 *
 * Each card leads with the issue's first Next step not yet done, because that
 * is the line that says who is holding it. Everything links to Linear, where the
 * work is edited — this page only reads.
 */

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Card({ issue, show }: { issue: PitIssue; show: "agent" | "status" }) {
  const joel = needsJoel(issue);
  const where = show === "agent" ? issue.agent ?? "No agent" : issue.status;
  return (
    <article className={`pw-card${joel ? " pw-joel" : ""}${issue.parked ? " pw-parked" : ""}`}>
      <div className="pw-card-top">
        <a className="pw-id" href={issue.url} target="_blank" rel="noopener noreferrer">
          {issue.id}
        </a>
        <span className="pw-meta">
          {where}
          {issue.priority > 0 ? ` · ${issue.priorityLabel}` : ""}
          {issue.parked ? " · Parked" : ""}
        </span>
      </div>
      <a className="pw-title" href={issue.url} target="_blank" rel="noopener noreferrer">
        {issue.title}
      </a>
      {issue.next ? (
        <p className="pw-next">
          {issue.next.star && <span className="pw-star" aria-label="waiting on Joel">⭐ </span>}
          {issue.next.actor && <b>{issue.next.actor}: </b>}
          {issue.next.text}
        </p>
      ) : (
        <p className="pw-next pw-quiet">No open Next step.</p>
      )}
      <p className="pw-foot" suppressHydrationWarning>
        {issue.owner ? `owner ${issue.owner} · ` : ""}updated {ago(issue.updatedAt)}
      </p>
    </article>
  );
}

function Count({ n }: { n: number }) {
  return <span className="pw-count">{n}</span>;
}

function ByStatus({ issues }: { issues: PitIssue[] }) {
  const board = byStatus(issues);
  return (
    <>
      {board.joel.length > 0 && (
        <section className="pw-band">
          <h3>
            Waiting on you <Count n={board.joel.length} />
          </h3>
          <div className="pw-grid">
            {board.joel.map((i) => (
              <Card key={i.id} issue={i} show="agent" />
            ))}
          </div>
        </section>
      )}

      <div className="pw-board">
        {board.columns.map((c) => (
          <section key={c.id} className="pw-col">
            <h3>
              {c.name} <Count n={c.issues.length} />
            </h3>
            {c.issues.length === 0 ? (
              <p className="pw-empty">Nothing here.</p>
            ) : (
              c.issues.map((i) => <Card key={i.id} issue={i} show="agent" />)
            )}
          </section>
        ))}
      </div>

      {board.later.length > 0 && (
        <details className="pw-later">
          <summary>
            Backlog and parked <Count n={board.later.length} />
          </summary>
          <div className="pw-grid">
            {board.later.map((i) => (
              <Card key={i.id} issue={i} show="agent" />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function ByAgent({ issues }: { issues: PitIssue[] }) {
  return (
    <>
      {byAgent(issues).map((g) => (
        <section key={g.agent} className="pw-agent">
          <h3>
            {g.agent} <Count n={g.issues.length} />
          </h3>
          <div className="pw-grid">
            {g.issues.map((i) => (
              <Card key={i.id} issue={i} show="status" />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function PitWall({ data, group }: { data: PitWallData; group: Grouping }) {
  const [grouping, setGrouping] = useState<Grouping>(group);

  function choose(next: Grouping) {
    setGrouping(next);
    // The URL follows without a navigation, so Linear is not asked again.
    const url = new URL(window.location.href);
    if (next === "agent") url.searchParams.set("group", "agent");
    else url.searchParams.delete("group");
    window.history.replaceState(null, "", url);
  }

  return (
    <section className="pitwall">
      <div className="pw-head">
        <p className="pw-asof" suppressHydrationWarning>
          Open issues in Linear, team TEC · read {ago(data.readAt)}
        </p>
        <div className="pw-toggle" role="group" aria-label="Group by">
          {(["status", "agent"] as const).map((g) => (
            <button key={g} type="button" aria-pressed={grouping === g} onClick={() => choose(g)}>
              {g === "status" ? "By status" : "By agent"}
            </button>
          ))}
        </div>
      </div>

      {!data.ok ? (
        <p className="pw-error">
          <span className="light light-caution" aria-hidden="true" /> <b>No issues to show.</b> {data.why}.
        </p>
      ) : data.issues.length === 0 ? (
        <p className="pw-empty">No open issues in team TEC.</p>
      ) : grouping === "status" ? (
        <ByStatus issues={data.issues} />
      ) : (
        <ByAgent issues={data.issues} />
      )}
    </section>
  );
}
