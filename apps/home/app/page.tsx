"use client";

import { useState } from "react";

const APPS = [
  {
    name: "Message Editor",
    href: "https://editor.techpaddock.io",
    status: "live" as const,
    description: "Drafts outreach messages in your own voice, using stored contact context.",
  },
  {
    name: "Pipeline Tracker",
    href: "https://tracker.techpaddock.io",
    status: "live" as const,
    description: "Single view of every active job-search thread, sorted to surface what's gone cold.",
  },
  {
    name: "Resume Formatter",
    href: "https://resume.techpaddock.io",
    status: "live" as const,
    description: "Single source of truth for resume content — pure formatting, no AI judgment calls.",
  },
];

export default function HomePage() {
  const [selected, setSelected] = useState(0);
  const app = APPS[selected];

  return (
    <main className="shell">
      <nav className="sidebar">
        <p className="eyebrow">Paddock</p>
        {APPS.map((a, i) => (
          <button
            key={a.name}
            className={`nav-item ${i === selected ? "active" : ""}`}
            onClick={() => setSelected(i)}
          >
            {a.name}
            <span className="status live">{a.status}</span>
          </button>
        ))}
      </nav>
      <section className="content">
        <h1>{app.name}</h1>
        <p className="description">{app.description}</p>
        <a href={app.href} className="open-button">
          Open {app.name} →
        </a>
      </section>
    </main>
  );
}
