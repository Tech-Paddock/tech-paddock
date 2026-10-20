"use client";

import { useState } from "react";
import type { PitIssue, PitWallData } from "@/lib/linear";
import { byApp, byStatus, needsOwner, type Grouping } from "@/lib/pitgroups";

/**
 * The Pit Wall: every open issue in Linear, team TEC, and who acts next.
 *
 * Two arrangements behind one toggle — by status, with what waits on the owner in a
 * band above the board, or by app. The toggle regroups what is already on the
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

function Card({ issue, show }: { issue: PitIssue; show: "app" | "status" }) {
  const waiting = needsOwner(issue);
  const where = show === "app" ? issue.app ?? "Platform" : issue.status;
  return (
    <article className={`pw-card${waiting ? " pw-waiting" : ""}${issue.parked ? " pw-parked" : ""}`}>
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
          {issue.next.star && <span className="pw-star" aria-label="waiting on you">⭐ </span>}
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
      {board.waiting.length > 0 && (
        <section className="pw-band">
          <h3>
            Waiting on you <Count n={board.waiting.length} />
          </h3>
          <div className="pw-grid">
            {board.waiting.map((i) => (
              <Card key={i.id} issue={i} show="app" />
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
              c.issues.map((i) => <Card key={i.id} issue={i} show="app" />)
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
              <Card key={i.id} issue={i} show="app" />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function ByApp({ issues }: { issues: PitIssue[] }) {
  return (
    <>
      {byApp(issues).map((g) => (
        <section key={g.app} className="pw-agent">
          <h3>
            {g.app} <Count n={g.issues.length} />
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
    if (next === "app") url.searchParams.set("group", "app");
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
          {(["status", "app"] as const).map((g) => (
            <button key={g} type="button" aria-pressed={grouping === g} onClick={() => choose(g)}>
              {g === "status" ? "By status" : "By app"}
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
        <ByApp issues={data.issues} />
      )}
    </section>
  );
}
