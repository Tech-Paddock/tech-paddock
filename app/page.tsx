"use client";

import { useEffect, useState } from "react";

type Contact = {
  id: string;
  name: string;
  org: string | null;
  relationship_type: string | null;
};

const MEDIUMS = ["text", "email", "linkedin", "slack"] as const;
const PURPOSES = ["ask", "follow-up", "decline"] as const;
const EFFORTS = [
  { value: "low", label: "Quick" },
  { value: "medium", label: "Quick+" },
  { value: "high", label: "Thorough" },
] as const;

export default function HomePage() {
  const [mode, setMode] = useState<"draft" | "train">("draft");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [medium, setMedium] = useState<(typeof MEDIUMS)[number]>("text");
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>("ask");
  const [tone, setTone] = useState("");
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]["value"]>("medium");
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [samples, setSamples] = useState("");
  const [styleGuide, setStyleGuide] = useState<{ version: number; content: string } | null>(null);
  const [training, setTraining] = useState(false);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => {});
    fetch("/api/style-guide")
      .then((r) => r.json())
      .then((d) => setStyleGuide(d.style_guide))
      .catch(() => {});
  }, []);

  async function handleDraft() {
    setLoading(true);
    setError(null);
    setDraft("");

    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contactId || undefined,
        medium,
        purpose,
        tone: tone || undefined,
        effort,
        input,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    const data = await res.json();
    setDraft(data.draft);
  }

  async function handleTrain() {
    setTraining(true);
    setError(null);

    const res = await fetch("/api/style-guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ samples }),
    });

    setTraining(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    const data = await res.json();
    setStyleGuide(data.style_guide);
    setSamples("");
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-accent font-medium">Paddock</p>
          <h1 className="text-2xl font-semibold">Message Editor</h1>
        </div>
        <div className="flex gap-1 bg-white border border-line rounded-lg p-1">
          <button
            onClick={() => setMode("draft")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              mode === "draft" ? "bg-accent text-white" : "text-ink/70"
            }`}
          >
            Draft
          </button>
          <button
            onClick={() => setMode("train")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              mode === "train" ? "bg-accent text-white" : "text-ink/70"
            }`}
          >
            Train
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {mode === "draft" ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Contact</span>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="border border-line rounded-lg px-3 py-2 bg-white"
              >
                <option value="">No contact linked</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.org ? ` — ${c.org}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Medium</span>
              <select
                value={medium}
                onChange={(e) => setMedium(e.target.value as typeof medium)}
                className="border border-line rounded-lg px-3 py-2 bg-white capitalize"
              >
                {MEDIUMS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Purpose</span>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                className="border border-line rounded-lg px-3 py-2 bg-white capitalize"
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Tone (optional)</span>
              <input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. warm, direct, brief"
                className="border border-line rounded-lg px-3 py-2 bg-white"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Effort</span>
            <div className="flex gap-2">
              {EFFORTS.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setEffort(e.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    effort === e.value
                      ? "bg-accent text-white border-accent"
                      : "bg-white border-line text-ink/70"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">What does this message need to say?</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder="e.g. Following up on our call last week, asking if there's an update on the role."
              className="border border-line rounded-lg px-3 py-2 bg-white resize-none"
            />
          </label>

          <button
            onClick={handleDraft}
            disabled={loading || !input}
            className="self-start bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
          >
            {loading ? "Drafting…" : "Draft message"}
          </button>

          {draft && (
            <div className="bg-white border border-line rounded-xl p-5 whitespace-pre-wrap text-sm leading-relaxed">
              {draft}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-white border border-line rounded-xl p-5">
            <p className="text-xs font-medium text-ink/60 uppercase tracking-wide">
              Current style guide{styleGuide ? ` — v${styleGuide.version}` : ""}
            </p>
            <pre className="mt-2 text-sm whitespace-pre-wrap font-sans">
              {styleGuide?.content}
            </pre>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Paste writing samples or past sent messages</span>
            <textarea
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
              rows={8}
              placeholder="Paste a few messages you've actually sent — the more, the better it learns your voice."
              className="border border-line rounded-lg px-3 py-2 bg-white resize-none"
            />
          </label>

          <button
            onClick={handleTrain}
            disabled={training || !samples}
            className="self-start bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
          >
            {training ? "Refining…" : "Refine style guide"}
          </button>
        </div>
      )}
    </main>
  );
}
