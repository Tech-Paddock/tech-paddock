"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LIVERY } from "@/lib/livery";
import ThemeControl, { LiveryBadge } from "./ThemeControl";

type Contact = {
  id: string;
  name: string;
  org: string | null;
  position: string | null;
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

// A picklist rather than free text so the same word reaches the model every
// time — "warm", "Warm" and "warmish" were all producing different drafts.
// Other keeps the escape hatch for a one-off tone worth spelling out.
const TONES = [
  "Warm",
  "Direct",
  "Brief",
  "Formal",
  "Casual",
  "Enthusiastic",
  "Apologetic",
] as const;

const TONE_OTHER = "__other__";

const RELATIONSHIP_TYPES = [
  "Professional · Warm",
  "Professional · Cold",
  "Personal · Warm",
  "Personal · Cold",
];

function DraftShell() {
  const [mode, setMode] = useState<"draft" | "train">("draft");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [contactId, setContactId] = useState<string>("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    org: "",
    position: "",
    relationship_type: RELATIONSHIP_TYPES[0],
    preferred_channel: "email",
  });
  const [savingContact, setSavingContact] = useState(false);

  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"] | "">("");
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]["value"] | "">("");
  const [toneChoice, setToneChoice] = useState("");
  const [toneOther, setToneOther] = useState("");
  const [context, setContext] = useState("");
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  const [samples, setSamples] = useState("");
  const [styleGuide, setStyleGuide] = useState<{ version: number; content: string } | null>(null);
  const [training, setTraining] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [modelDrift, setModelDrift] = useState<{ newly_detected: string[] } | null>(null);

  // Arriving from a dashboard or hub link that already knows who this is for.
  const linkedContactId = useSearchParams().get("contact");

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => {
        const loaded: Contact[] = d.contacts ?? [];
        setContacts(loaded);

        if (linkedContactId) {
          const match = loaded.find((c) => c.id === linkedContactId);
          if (match) {
            setContactId(match.id);
            setContactQuery(`${match.name}${match.org ? ` — ${match.org}` : ""}`);
            // Their stored preference is the whole point of linking a contact.
            if (match.preferred_channel) {
              setChannel(match.preferred_channel as typeof channel);
            }
          }
        }
      })
      .catch(() => {});
    fetch("/api/style-guide")
      .then((r) => r.json())
      .then((d) => setStyleGuide(d.style_guide))
      .catch(() => {});
    fetch("/api/model-check")
      .then((r) => r.json())
      .then((d) => {
        if (d.status?.drift_detected) setModelDrift(d.status);
      })
      .catch(() => {});
  }, [linkedContactId]);

  // What actually goes over the wire and into message_history: the picked
  // tone, or whatever was typed under Other. Empty means no tone specified.
  const tone = (toneChoice === TONE_OTHER ? toneOther : toneChoice).trim();

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
    setNewContact({
      name: "",
      org: "",
      position: "",
      relationship_type: RELATIONSHIP_TYPES[0],
      preferred_channel: "email",
    });
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
        effort: "high",
        context: context.trim() || undefined,
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

    setCommitted(true);
  }

  async function handleLoadHistory() {
    setLoadingHistory(true);
    setError(null);

    const res = await fetch("/api/message-history");

    setLoadingHistory(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    const data = await res.json();
    const formatted = (data.messages as { medium: string; purpose: string | null; tone: string | null; content: string }[])
      .map((m) => {
        const tag = [`medium: ${m.medium}`, m.purpose ? `purpose: ${m.purpose}` : null, m.tone ? `tone: ${m.tone}` : null]
          .filter(Boolean)
          .join(", ");
        return `[${tag}]\n${m.content}`;
      })
      .join("\n\n");

    setSamples(formatted);
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Message Editor</h1>
          <LiveryBadge livery={LIVERY} />
        </div>
        <div className="flex items-center gap-3">
          <ThemeControl />
          <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
            <button
              onClick={() => setMode("draft")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                mode === "draft" ? "bg-accent text-accent-ink" : "text-ink/70"
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setMode("train")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                mode === "train" ? "bg-accent text-accent-ink" : "text-ink/70"
              }`}
            >
              Train
            </button>
          </div>
        </div>
      </header>

      {modelDrift && (
        <div className="bg-surface border border-warn text-warn text-sm rounded-lg px-4 py-3">
          New Sonnet model{modelDrift.newly_detected.length > 1 ? "s" : ""} detected:{" "}
          <span className="font-medium">{modelDrift.newly_detected.join(", ")}</span> — still
          drafting on Sonnet 5 until this is reviewed.
        </div>
      )}

      {error && (
        <div className="bg-surface border border-urgent text-urgent text-sm rounded-lg px-4 py-3">
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
                  className="flex-1 border border-line rounded-lg px-3 py-2 bg-surface"
                />
                <button
                  type="button"
                  onClick={() => setNewContactOpen((v) => !v)}
                  className="px-3 py-2 rounded-lg border border-line bg-surface text-sm font-medium text-ink/70 whitespace-nowrap"
                >
                  + New contact
                </button>
              </div>

              {contactMenuOpen && (
                <div className="absolute top-full left-0 right-[104px] mt-1 bg-surface border border-line rounded-lg shadow-sm max-h-56 overflow-y-auto z-10">
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
                      {c.org ? <span className="text-ink-soft"> — {c.org}</span> : null}
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <p className="px-3 py-2 text-sm text-ink-soft">No matches</p>
                  )}
                </div>
              )}
            </div>

            {newContactOpen && (
              <div className="col-span-2 border border-line rounded-lg p-4 bg-surface flex flex-col gap-3">
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
                  <input
                    value={newContact.position}
                    onChange={(e) => setNewContact({ ...newContact, position: e.target.value })}
                    placeholder="Position (optional)"
                    className="col-span-2 border border-line rounded-lg px-3 py-2 text-sm"
                  />
                  <select
                    value={newContact.relationship_type}
                    onChange={(e) => setNewContact({ ...newContact, relationship_type: e.target.value })}
                    className="border border-line rounded-lg px-3 py-2 text-sm bg-surface"
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
                    className="border border-line rounded-lg px-3 py-2 text-sm bg-surface"
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
                  className="self-start bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                >
                  {savingContact ? "Saving…" : "Save contact"}
                </button>
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Channel *</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              >
                <option value="" disabled>
                  Select…
                </option>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Purpose *</span>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              >
                <option value="" disabled>
                  Select…
                </option>
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Tone (optional)</span>
              <select
                value={toneChoice}
                onChange={(e) => setToneChoice(e.target.value)}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              >
                <option value="">No particular tone</option>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value={TONE_OTHER}>Other…</option>
              </select>
            </label>

            {toneChoice === TONE_OTHER && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Describe the tone</span>
                <input
                  value={toneOther}
                  onChange={(e) => setToneOther(e.target.value)}
                  autoFocus
                  placeholder="e.g. rueful but not grovelling"
                  className="border border-line rounded-lg px-3 py-2 bg-surface"
                />
              </label>
            )}
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Context (optional)</span>
            <span className="text-xs text-ink/60 -mt-1">
              Background to read before drafting — what has already happened, what they said last,
              anything that should shape the message without necessarily appearing in it.
            </span>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="e.g. We met at a conference panel in March. They offered to make an intro and never followed up."
              className="border border-line rounded-lg px-3 py-2 bg-surface resize-y min-h-20"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium flex items-center gap-1.5">
              What does this message need to say?
              <span className="inline-flex items-center gap-1.5 text-xs font-normal text-ink/60">
                Model: Sonnet 5
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    modelDrift ? "bg-urgent text-ink-invert" : "bg-accent text-accent-ink"
                  }`}
                >
                  {modelDrift ? "Outdated" : "Current"}
                </span>
              </span>
            </span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder="e.g. Following up on our call last week, asking if there's an update on the role."
              className="border border-line rounded-lg px-3 py-2 bg-surface resize-y min-h-24"
            />
          </label>

          <button
            onClick={handleDraft}
            disabled={loading || !input || !channel || !purpose}
            className="self-start bg-accent text-accent-ink rounded-lg px-4 py-2 font-medium disabled:opacity-60"
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
                className="bg-surface border border-line rounded-xl p-5 text-sm leading-relaxed resize-y"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCommit}
                  disabled={committing || committed || !draft.trim()}
                  className="self-start bg-ink text-ink-invert rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {committing ? "Saving…" : committed ? "Logged ✓" : "Sent this — log it"}
                </button>
                <p className="text-xs text-ink-soft">
                  Edit the draft above to match exactly what you sent, then log it — it's appended to history
                  (used as context for future drafts to this contact) without touching the style guide. Refine
                  the guide itself, in batches, from the Train tab whenever you want.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-surface border border-line rounded-xl p-5">
            <p className="text-xs font-medium text-ink/60 uppercase tracking-wide">
              Current style guide{styleGuide ? ` — v${styleGuide.version}` : ""}
            </p>
            <pre className="mt-2 text-sm whitespace-pre-wrap font-sans">
              {styleGuide?.content}
            </pre>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Writing samples or past sent messages</span>
            <button
              type="button"
              onClick={handleLoadHistory}
              disabled={loadingHistory}
              className="text-sm font-medium text-accent disabled:opacity-60"
            >
              {loadingHistory ? "Loading…" : "Load from logged history →"}
            </button>
          </div>
          <textarea
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            rows={10}
            placeholder="Paste a few messages you've actually sent, or load from logged history above — the more, the better it learns your voice."
            className="border border-line rounded-lg px-3 py-2 bg-surface resize-none"
          />

          <button
            onClick={handleTrain}
            disabled={training || !samples}
            className="self-start bg-accent text-accent-ink rounded-lg px-4 py-2 font-medium disabled:opacity-60"
          >
            {training ? "Refining…" : "Refine style guide"}
          </button>

          <p className="text-xs text-ink-soft">
            Refining is deliberate and batched on purpose — it rewrites the whole guide via Claude, so doing it
            per-message would drift the rules based on a sample size of one. Log messages from the Draft tab as
            you send them, then come back here occasionally to fold a real batch in at once.
          </p>
        </div>
      )}
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <DraftShell />
    </Suspense>
  );
}
