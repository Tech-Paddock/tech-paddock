"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type Entry = {
  id: string;
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
};

type Bullet = {
  id: string;
  entry_id: string;
  content: string;
  display_order: number;
};

type Highlight = {
  id: string;
  content: string;
  display_order: number;
};

type Template = {
  id: string;
  name: string;
  is_active: boolean;
  font: string | null;
  font_size: number | null;
  highlights_style: "table" | "list";
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Request failed");
  }
  return res.json();
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    try {
      const [e, b, h, t] = await Promise.all([
        api<{ entries: Entry[] }>("/api/entries"),
        api<{ bullets: Bullet[] }>("/api/bullets"),
        api<{ highlights: Highlight[] }>("/api/highlights"),
        api<{ templates: Template[] }>("/api/templates"),
      ]);
      setEntries(e.entries);
      setBullets(b.bullets);
      setHighlights(h.highlights);
      setTemplates(t.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addEntry() {
    await api("/api/entries", {
      method: "POST",
      body: JSON.stringify({ company: "New Company", title: "New Title", display_order: entries.length }),
    });
    refresh();
  }

  async function updateEntry(id: string, field: keyof Entry, value: string) {
    await api(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) });
    refresh();
  }

  async function deleteEntry(id: string) {
    await api(`/api/entries/${id}`, { method: "DELETE" });
    refresh();
  }

  async function addBullet(entryId: string) {
    const count = bullets.filter((b) => b.entry_id === entryId).length;
    await api("/api/bullets", {
      method: "POST",
      body: JSON.stringify({ entry_id: entryId, content: "New bullet", display_order: count }),
    });
    refresh();
  }

  async function updateBullet(id: string, content: string) {
    await api(`/api/bullets/${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
    refresh();
  }

  async function deleteBullet(id: string) {
    await api(`/api/bullets/${id}`, { method: "DELETE" });
    refresh();
  }

  async function addHighlight() {
    await api("/api/highlights", {
      method: "POST",
      body: JSON.stringify({ content: "New highlight", display_order: highlights.length }),
    });
    refresh();
  }

  async function updateHighlight(id: string, content: string) {
    await api(`/api/highlights/${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
    refresh();
  }

  async function deleteHighlight(id: string) {
    await api(`/api/highlights/${id}`, { method: "DELETE" });
    refresh();
  }

  async function setActiveTemplate(id: string) {
    await api(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) });
    refresh();
  }

  async function addTemplate() {
    await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: `Template ${templates.length + 1}`, highlights_style: "list" }),
    });
    refresh();
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AppShell
      active="resume"
      icon="📄"
      title="Resume Formatter"
      sidebarExtra={
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40 px-2 mt-4 mb-1">
            Sections
          </p>
          <a href="#experience" className="px-2 py-1.5 rounded-md text-ink hover:bg-paper">
            Experience
          </a>
          <a href="#highlights" className="px-2 py-1.5 rounded-md text-ink hover:bg-paper">
            Career Highlights
          </a>
          <a href="#templates" className="px-2 py-1.5 rounded-md text-ink hover:bg-paper">
            Templates
          </a>
        </>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resume Formatter</h1>
          <p className="text-sm text-ink/50">
            Pure formatting — structured content in, a matching .docx out.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
        >
          {generating ? "Generating…" : "Generate .docx"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <section id="experience" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Experience</h2>
          <button onClick={addEntry} className="text-sm text-accent underline">
            + Add role
          </button>
        </div>
        {entries.map((entry) => (
          <div key={entry.id} className="bg-white border border-line rounded-xl p-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                defaultValue={entry.company}
                onBlur={(e) => updateEntry(entry.id, "company", e.target.value)}
                className="border border-line rounded-lg px-2 py-1 flex-1"
                placeholder="Company"
              />
              <input
                defaultValue={entry.title}
                onBlur={(e) => updateEntry(entry.id, "title", e.target.value)}
                className="border border-line rounded-lg px-2 py-1 flex-1"
                placeholder="Title"
              />
              <button onClick={() => deleteEntry(entry.id)} className="text-sm text-red-700">
                Remove
              </button>
            </div>
            <div className="flex flex-col gap-1 pl-2">
              {bullets
                .filter((b) => b.entry_id === entry.id)
                .map((bullet) => (
                  <div key={bullet.id} className="flex gap-2 items-center">
                    <span>•</span>
                    <input
                      defaultValue={bullet.content}
                      onBlur={(e) => updateBullet(bullet.id, e.target.value)}
                      className="border border-line rounded-lg px-2 py-1 flex-1 text-sm"
                    />
                    <button onClick={() => deleteBullet(bullet.id)} className="text-xs text-red-700">
                      ✕
                    </button>
                  </div>
                ))}
              <button onClick={() => addBullet(entry.id)} className="text-xs text-accent underline self-start">
                + Add bullet
              </button>
            </div>
          </div>
        ))}
      </section>

      <section id="highlights" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Career Highlights</h2>
          <button onClick={addHighlight} className="text-sm text-accent underline">
            + Add highlight
          </button>
        </div>
        <div className="bg-white border border-line rounded-xl p-4 flex flex-col gap-2">
          {highlights.map((h) => (
            <div key={h.id} className="flex gap-2 items-center">
              <input
                defaultValue={h.content}
                onBlur={(e) => updateHighlight(h.id, e.target.value)}
                className="border border-line rounded-lg px-2 py-1 flex-1 text-sm"
              />
              <button onClick={() => deleteHighlight(h.id)} className="text-xs text-red-700">
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      <section id="templates" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button onClick={addTemplate} className="text-sm text-accent underline">
            + Add template
          </button>
        </div>
        <div className="bg-white border border-line rounded-xl p-4 flex flex-col gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between">
              <span>
                {t.name} {t.is_active && <span className="text-accent font-medium">(active)</span>}
              </span>
              {!t.is_active && (
                <button onClick={() => setActiveTemplate(t.id)} className="text-sm text-accent underline">
                  Make active
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
