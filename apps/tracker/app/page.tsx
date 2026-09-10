"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Contact = { id: string; name: string; org: string | null; preferred_channel: string | null };

type Thread = {
  id: string;
  contact_id: string | null;
  company: string;
  stage: string;
  last_touch_date: string;
  next_action: string | null;
  notes: string | null;
  open_task_id: string | null;
};

const STAGES = ["Applied", "Networking", "Interviewing", "Offer", "Cooling", "Closed"] as const;
const STALE_THRESHOLD_DAYS = 10;

function daysSince(dateStr: string) {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export default function HomePage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newThread, setNewThread] = useState({ company: "", contact_id: "", stage: "Applied", next_action: "" });
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);

  async function refresh() {
    const [t, c] = await Promise.all([
      fetch("/api/threads").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ]);
    setThreads(t.threads ?? []);
    setContacts(c.contacts ?? []);
  }

  useEffect(() => {
    refresh().catch(() => setError("Failed to load"));
  }, []);

  const contactName = useMemo(() => {
    const map = new Map(contacts.map((c) => [c.id, c.name + (c.org ? ` — ${c.org}` : "")]));
    return (id: string | null) => (id ? map.get(id) ?? "Unknown contact" : "—");
  }, [contacts]);

  const sorted = useMemo(
    () => [...threads].sort((a, b) => daysSince(b.last_touch_date) - daysSince(a.last_touch_date)),
    [threads]
  );

  async function updateThread(id: string, patch: Partial<Thread>) {
    const res = await fetch(`/api/threads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) refresh();
  }

  async function deleteThread(id: string) {
    const res = await fetch(`/api/threads/${id}`, { method: "DELETE" });
    if (res.ok) refresh();
  }

  async function createThread() {
    if (!newThread.company.trim()) return;
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: newThread.company,
        contact_id: newThread.contact_id || null,
        stage: newThread.stage,
        next_action: newThread.next_action || null,
      }),
    });
    if (res.ok) {
      setNewThread({ company: "", contact_id: "", stage: "Applied", next_action: "" });
      setNewOpen(false);
      refresh();
    }
  }

  async function draftFollowUp(id: string) {
    setDraftFor(id);
    setDraftLoading(true);
    setDraftText("");
    setError(null);

    const res = await fetch(`/api/threads/${id}/draft`, { method: "POST" });
    setDraftLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Draft failed");
      setDraftFor(null);
      return;
    }

    const data = await res.json();
    setDraftText(data.draft);
  }

  return (
    <AppShell
      active="tracker"
      icon="📊"
      title="Pipeline Tracker"
      sidebarExtra={
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40 px-2 mt-4 mb-1">
            View
          </p>
          <span className="px-2 py-1.5 rounded-md bg-ink text-white font-bold">All Threads</span>
        </>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Tracker</h1>
          <p className="text-sm text-ink/50">
            Sorted by days since last touch — stale threads are flagged.
          </p>
        </div>
        <button
          onClick={() => setNewOpen((v) => !v)}
          className="px-3 py-2 rounded-lg border border-line bg-white text-sm font-medium"
        >
          + New thread
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {newOpen && (
        <div className="border border-line rounded-lg p-4 bg-white flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={newThread.company}
              onChange={(e) => setNewThread({ ...newThread, company: e.target.value })}
              placeholder="Company"
              className="border border-line rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={newThread.contact_id}
              onChange={(e) => setNewThread({ ...newThread, contact_id: e.target.value })}
              className="border border-line rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">No contact linked</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.org ? ` — ${c.org}` : ""}
                </option>
              ))}
            </select>
            <select
              value={newThread.stage}
              onChange={(e) => setNewThread({ ...newThread, stage: e.target.value })}
              className="border border-line rounded-lg px-3 py-2 text-sm bg-white"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              value={newThread.next_action}
              onChange={(e) => setNewThread({ ...newThread, next_action: e.target.value })}
              placeholder="Next action (optional)"
              className="border border-line rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={createThread}
            disabled={!newThread.company.trim()}
            className="self-start bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            Save thread
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((t) => {
          const stale = daysSince(t.last_touch_date) >= STALE_THRESHOLD_DAYS;
          return (
            <div
              key={t.id}
              className={`border rounded-xl p-4 bg-white flex flex-col gap-3 ${
                stale ? "border-red-300" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{t.company}</p>
                  <p className="text-sm text-ink/60">{contactName(t.contact_id)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {stale && (
                    <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                      {daysSince(t.last_touch_date)}d stale
                    </span>
                  )}
                  <button onClick={() => deleteThread(t.id)} className="text-xs text-red-700">
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <select
                  value={t.stage}
                  onChange={(e) => updateThread(t.id, { stage: e.target.value })}
                  className="border border-line rounded-lg px-2 py-1.5 bg-white"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  defaultValue={t.last_touch_date}
                  onBlur={(e) => updateThread(t.id, { last_touch_date: e.target.value })}
                  className="border border-line rounded-lg px-2 py-1.5"
                />
                <input
                  defaultValue={t.next_action ?? ""}
                  placeholder="Next action"
                  onBlur={(e) => updateThread(t.id, { next_action: e.target.value })}
                  className="col-span-2 border border-line rounded-lg px-2 py-1.5"
                />
                <textarea
                  defaultValue={t.notes ?? ""}
                  placeholder="Notes"
                  rows={2}
                  onBlur={(e) => updateThread(t.id, { notes: e.target.value })}
                  className="col-span-2 border border-line rounded-lg px-2 py-1.5 resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => draftFollowUp(t.id)}
                  disabled={!t.contact_id || draftLoading}
                  className="self-start text-sm font-medium text-accent disabled:opacity-40"
                  title={t.contact_id ? undefined : "Link a contact to draft a follow-up"}
                >
                  {draftLoading && draftFor === t.id ? "Drafting…" : "Draft follow-up →"}
                </button>
                {draftFor === t.id && draftText && (
                  <div className="bg-paper border border-line rounded-lg p-3 text-sm whitespace-pre-wrap">
                    {draftText}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-sm text-ink/50">No threads yet.</p>}
      </div>
    </AppShell>
  );
}
