"use client";

import { useEffect, useMemo, useState } from "react";

type Contact = {
  id: string;
  name: string;
  org: string | null;
  relationship_type: string | null;
  preferred_channel: string | null;
};

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "text", label: "Text Message" },
] as const;

const PURPOSES = [
  { value: "ask", label: "Ask" },
  { value: "follow-up", label: "Follow-up" },
  { value: "decline", label: "Decline" },
  { value: "networking", label: "Networking" },
  { value: "job-outreach", label: "Job outreach" },
  { value: "other", label: "Other" },
] as const;

const RELATIONSHIP_TYPES = [
  "Professional · Warm",
  "Professional · Cold",
  "Personal · Warm",
  "Personal · Cold",
];

const EFFORTS = [
  { value: "low", label: "Quick" },
  { value: "medium", label: "Quick+" },
  { value: "high", label: "Thorough" },
] as const;

export default function HomePage() {
  const [mode, setMode] = useState<"draft" | "train">("draft");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [contactId, setContactId] = useState<string>("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    org: "",
    relationship_type: RELATIONSHIP_TYPES[0],
    preferred_channel: "email",
  });
  const [savingContact, setSavingContact] = useState(false);

  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"]>("text");
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]["value"]>("ask");
  const [tone, setTone] = useState("");
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]["value"]>("medium");
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

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

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.org?.toLowerCase().includes(q)
    );
  }, [contacts, contactQuery]);

  function selectContact(c: Contact | null) {
    setContactId(c?.id ?? "");
    setContactQuery(c ? `${c.name}${c.org ? ` — ${c.org}` : ""}` : "");
    setContactMenuOpen(false);
  }

  async function handleCreateContact() {
    if (!newContact.name.trim()) return;
    setSavingContact(true);

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newContact),
    });

    setSavingContact(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't create contact");
      return;
    }

    const data = await res.json();
    setContacts((prev) => [...prev, data.contact]);
    selectContact(data.contact);
    setNewContactOpen(false);
    setNewContact({ name: "", org: "", relationship_type: RELATIONSHIP_TYPES[0], preferred_channel: "email" });
  }

  async function handleDraft() {
    setLoading(true);
    setError(null);
    setDraft("");
    setCommitted(false);

    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contactId || undefined,
        medium: channel,
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

  async function handleCommit() {
    setCommitting(true);
    setError(null);

    const res = await fetch("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contactId || undefined,
        medium: channel,
        purpose,
        tone: tone || undefined,
        content: draft,
      }),
    });

    setCommitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    const data = await res.json();
    setStyleGuide(data.style_guide);
    setCommitted(true);
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
            <div className="col-span-2 flex flex-col gap-1.5 text-sm relative">
              <span className="font-medium">Contact</span>
              <div className="flex gap-2">
                <input
                  value={contactQuery}
                  onChange={(e) => {
                    setContactQuery(e.target.value);
                    setContactId("");
                    setContactMenuOpen(true);
                  }}
                  onFocus={() => setContactMenuOpen(true)}
                  onBlur={() => setTimeout(() => setContactMenuOpen(false), 150)}
                  placeholder="Search contacts, or leave blank"
                  className="flex-1 border border-line rounded-lg px-3 py-2 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setNewContactOpen((v) => !v)}
                  className="px-3 py-2 rounded-lg border border-line bg-white text-sm font-medium text-ink/70 whitespace-nowrap"
                >
                  + New contact
                </button>
              </div>

              {contactMenuOpen && (
                <div className="absolute top-full left-0 right-[104px] mt-1 bg-white border border-line rounded-lg shadow-sm max-h-56 overflow-y-auto z-10">
                  <button
                    type="button"
                    onMouseDown={() => selectContact(null)}
                    className="w-full text-left px-3 py-2 text-sm text-ink/60 hover:bg-paper"
                  >
                    No contact linked
                  </button>
                  {filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectContact(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-paper"
                    >
                      {c.name}
                      {c.org ? <span className="text-ink/50"> — {c.org}</span> : null}
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <p className="px-3 py-2 text-sm text-ink/50">No matches</p>
                  )}
                </div>
              )}
            </div>

            {newContactOpen && (
              <div className="col-span-2 border border-line rounded-lg p-4 bg-white flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    placeholder="Name"
                    className="border border-line rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={newContact.org}
                    onChange={(e) => setNewContact({ ...newContact, org: e.target.value })}
                    placeholder="Org (optional)"
                    className="border border-line rounded-lg px-3 py-2 text-sm"
                  />
                  <select
                    value={newContact.relationship_type}
                    onChange={(e) => setNewContact({ ...newContact, relationship_type: e.target.value })}
                    className="border border-line rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {RELATIONSHIP_TYPES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newContact.preferred_channel}
                    onChange={(e) => setNewContact({ ...newContact, preferred_channel: e.target.value })}
                    className="border border-line rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreateContact}
                  disabled={savingContact || !newContact.name.trim()}
                  className="self-start bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                >
                  {savingContact ? "Saving…" : "Save contact"}
                </button>
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Channel</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="border border-line rounded-lg px-3 py-2 bg-white"
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Purpose</span>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                className="border border-line rounded-lg px-3 py-2 bg-white"
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-2 flex flex-col gap-1.5 text-sm">
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
            <div className="flex flex-col gap-3">
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setCommitted(false);
                }}
                rows={6}
                className="bg-white border border-line rounded-xl p-5 text-sm leading-relaxed resize-y"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCommit}
                  disabled={committing || committed || !draft.trim()}
                  className="self-start bg-ink text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {committing ? "Saving…" : committed ? "Saved to training ✓" : "Sent this — commit to training"}
                </button>
                <p className="text-xs text-ink/50">
                  Edit the draft above to match exactly what you sent, then commit it — it's logged to this
                  contact's history and folded into the style guide.
                </p>
              </div>
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

          <p className="text-xs text-ink/50">
            Prefer committing one message at a time instead? Draft one on the Draft tab, edit it to match what
            you actually sent, and use "Sent this — commit to training" there.
          </p>
        </div>
      )}
    </main>
  );
}
