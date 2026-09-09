const APPS = [
  { name: "Message Editor", href: "https://editor.techpaddock.io", status: "live" as const },
  { name: "Pipeline Tracker", href: null, status: "coming soon" as const },
  { name: "Resume Formatter", href: null, status: "coming soon" as const },
];

export default function HomePage() {
  return (
    <main>
      <div style={{ textAlign: "center" }}>
        <p className="eyebrow">Paddock</p>
        <h1>Pick a tool</h1>
      </div>
      <nav className="apps">
        {APPS.map((app) =>
          app.href ? (
            <a key={app.name} href={app.href} className="app-link">
              {app.name}
              <span className="status live">live</span>
            </a>
          ) : (
            <span key={app.name} className="app-link disabled">
              {app.name}
              <span className="status">{app.status}</span>
            </span>
          )
        )}
      </nav>
    </main>
  );
}
