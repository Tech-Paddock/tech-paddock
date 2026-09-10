"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const APPS = [
  { slug: "editor", name: "Message Editor", href: "https://editor.techpaddock.io", team: "ferrari" },
  { slug: "tracker", name: "Pipeline Tracker", href: "https://tracker.techpaddock.io", team: "mercedes" },
  { slug: "resume", name: "Resume Formatter", href: "https://resume.techpaddock.io", team: "astonmartin" },
];

function HomeShell() {
  const router = useRouter();
  const params = useSearchParams();
  const slugParam = params.get("app");
  const selectedIndex = APPS.findIndex((a) => a.slug === slugParam);
  const selected = selectedIndex === -1 ? null : selectedIndex;

  function select(i: number) {
    router.replace(`/?app=${APPS[i].slug}`);
  }

  return (
    <main className="shell">
      <nav className="sidebar">
        <p className="eyebrow">Paddock</p>
        {APPS.map((a, i) => (
          <button
            key={a.name}
            className={`nav-item team-${a.team} ${i === selected ? "active" : ""}`}
            onClick={() => select(i)}
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
                  onClick={() => select(i)}
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

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeShell />
    </Suspense>
  );
}
