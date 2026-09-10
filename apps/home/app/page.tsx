"use client";

import { useState } from "react";

const APPS = [
  { name: "Message Editor", href: "https://editor.techpaddock.io", team: "ferrari" },
  { name: "Pipeline Tracker", href: "https://tracker.techpaddock.io", team: "mercedes" },
  { name: "Resume Formatter", href: "https://resume.techpaddock.io", team: "astonmartin" },
];

export default function HomePage() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <main className="shell">
      <nav className="sidebar">
        <p className="eyebrow">Paddock</p>
        {APPS.map((a, i) => (
          <button
            key={a.name}
            className={`nav-item team-${a.team} ${i === selected ? "active" : ""}`}
            onClick={() => setSelected(i)}
          >
            {a.name}
          </button>
        ))}
      </nav>
      <section className="content">
        {selected === null ? (
          <div className="placeholder">
            <p className="eyebrow">Paddock</p>
            <h1>Pick a tool</h1>
            <p className="description">Select one to open it here.</p>
            <div className="app-buttons">
              {APPS.map((a, i) => (
                <button
                  key={a.name}
                  className={`app-button team-${a.team}`}
                  onClick={() => setSelected(i)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <iframe
            key={APPS[selected].href}
            src={APPS[selected].href}
            title={APPS[selected].name}
            className="app-frame"
          />
        )}
      </section>
    </main>
  );
}
