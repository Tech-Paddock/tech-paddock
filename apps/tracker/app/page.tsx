"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Contact = { id: string; name: string; org: string | null; preferred_channel: string | null };

type Touch = {
  at: string;
  source: "recorded" | "message" | "render" | "meeting";
  aheadOfRecord: boolean;
};

type Thread = {
  id: string;
  contact_id: string | null;
  company: string;
  stage: string;
  last_touch_date: string;
  next_action: string | null;
  notes: string | null;
  open_task_id: string | null;
  /** Derived server-side from messages, submissions and meetings. */
  effective_touch: Touch | null;
  decay_threshold: number;
};

const STAGES = ["Applied", "Networking", "Interviewing", "Offer", "Cooling", "Closed"] as const;

const TOUCH_LABEL: Record<Touch["source"], string> = {
  recorded: "recorded by hand",
  message: "from a message you sent",
  render: "from a resume you submitted",
  meeting: "from a meeting that happened",
};

function daysSince(dateStr: string) {
  const then = dateStr.length <= 10 ? new Date(dateStr + "T00:00:00") : new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

/** Days since the real last touch, which is rarely the date on the record. */
function quietDays(t: Thread) {
  return daysSince(t.effective_touch?.at ?? t.last_touch_date);
}

function HomeShell() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newThread, setNewThread] = useState({ company: "", contact_id: "", stage: "Applied", next_action: "" });
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const focusedThread = useSearchParams().get("thread");
  const focusedRef = useRef<HTMLDivElement | null>(null);

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
    () => [...threads].sort((a, b) => quietDays(b) - quietDays(a)),
    [threads]
  );

  // Arriving from a dashboard or hub link: bring the named thread into view
  // rather than leaving it to be hunted for in the list.
  useEffect(() => {
    if (focusedThread && focusedRef.current) {
      focusedRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedThread, threads.length]);

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
    <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="px-3 py-2 rounded-lg border border-line bg-white text-sm font-medium"
          >
            Dashboard
          </Link>
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="px-3 py-2 rounded-lg border border-line bg-white text-sm font-medium"
          >
            + New thread
          </button>
        </div>
      </header>

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
          const quiet = quietDays(t);
          const stale = t.stage !== "Closed" && quiet >= t.decay_threshold;
          const focused = t.id === focusedThread;
          return (
            <div
              key={t.id}
              ref={focused ? focusedRef : undefined}
              className={`border rounded-xl p-4 bg-white flex flex-col gap-3 ${
                stale ? "border-red-300" : "border-line"
              } ${focused ? "ring-2 ring-accent ring-offset-2" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{t.company}</p>
                  <p className="text-sm text-ink/60">{contactName(t.contact_id)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {stale && (
                    <span
                      className="text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full"
                      title={`Past the ${t.decay_threshold}-day threshold for ${t.stage}`}
                    >
                      {quiet}d quiet
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
                <div className="flex flex-col gap-1">
                  <input
                    type="date"
                    defaultValue={t.last_touch_date}
                    onBlur={(e) => updateThread(t.id, { last_touch_date: e.target.value })}
                    className="border border-line rounded-lg px-2 py-1.5"
                  />
                  {t.effective_touch?.aheadOfRecord && (
                    <p className="text-xs text-ink/45">
                      Counting {quiet}d {TOUCH_LABEL[t.effective_touch.source]}, not this date.
                    </p>
                  )}
                </div>
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
