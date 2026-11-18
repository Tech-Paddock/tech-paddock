"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  configured: boolean;
  secret_expires: string;
  warning: string | null;
  connected?: boolean;
  last_sync?: string | null;
  unsent?: number;
  last_error?: string | null;
  error?: string;
};

/**
 * The household calendar's state, on /more (rules: apps/grid/RULES.md, "Calendar
 * contract"): whether Outlook is connected, how many events still wait, the last
 * error, and the secret's expiry warning. Read-only apart from "Send now", which
 * asks the server to push what is waiting. Never shows a token or an event.
 */
export default function CalendarStatus() {
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/status", { cache: "no-store" });
      setS((await res.json()) as Status);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function sendNow() {
    setSending(true);
    setNote(null);
    try {
      const res = await fetch("/api/calendar/flush", { method: "POST" });
      const j = (await res.json()) as { busy?: boolean; error?: string };
      setNote(!res.ok ? (j.error ?? "Could not send.") : j.busy ? "A send is already running." : null);
    } catch {
      setNote("Could not send.");
    }
    setSending(false);
    await load();
  }

  const connectLink = (label: string) => (
    <a href="/api/calendar/connect" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-ink">
      {label}
    </a>
  );

  return (
    <section aria-labelledby="calendar-h" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="calendar-h" className="text-lg font-semibold">
        Calendar
      </h2>
      {failed && <p className="mt-2 text-sm text-ink/70">Couldn&apos;t read the calendar&apos;s state.</p>}
      {!s && !failed && <p className="mt-2 text-sm text-ink/70">Loading…</p>}
      {s && (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          {s.warning && (
            <p role="alert" className="rounded-lg border border-urgent px-3 py-2">
              {s.warning}
            </p>
          )}
          {s.error ? (
            <p role="alert" className="rounded-lg border border-urgent px-3 py-2">
              {s.error}
            </p>
          ) : (
            <>
              <p>
                <span className="font-medium">Outlook:</span> {!s.configured ? "not set up (the Microsoft keys are missing in this project)" : s.connected ? "connected" : "not connected"}
                {s.connected && s.last_sync && <span className="text-ink/70"> · last reached {new Date(s.last_sync).toLocaleString()}</span>}
              </p>
              <p>
                <span className="font-medium">Waiting to send:</span> {s.unsent ?? 0}
              </p>
              {s.last_error && (
                <p role="alert">
                  <span className="font-medium">Last error:</span> {s.last_error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {s.configured && connectLink(s.connected ? "Reconnect" : "Connect Outlook")}
                {s.connected && (s.unsent ?? 0) > 0 && (
                  <button type="button" onClick={() => void sendNow()} disabled={sending} className="min-h-11 rounded-lg border border-line px-4 font-medium disabled:opacity-50">
                    {sending ? "Sending…" : "Send now"}
                  </button>
                )}
              </div>
              {note && <p role="status">{note}</p>}
            </>
          )}
          <p className="text-xs text-ink/70">The Microsoft secret expires {s.secret_expires}.</p>
        </div>
      )}
    </section>
  );
}
