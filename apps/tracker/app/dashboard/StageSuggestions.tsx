"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StageSuggestion } from "@/lib/dashboard";

/**
 * The calendar knows a thread moved before the thread does. Suggest it, never
 * apply it — the same posture as the model drift check, which flags a new model
 * and refuses to swap the pinned one for you. Confirming is one click; ignoring
 * it costs nothing and the suggestion simply stops appearing once the stage
 * matches.
 */
export default function StageSuggestions({ suggestions }: { suggestions: StageSuggestion[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const visible = suggestions.filter((s) => !dismissed.includes(s.threadId));
  if (visible.length === 0) return null;

  async function confirm(s: StageSuggestion) {
    setPending(s.threadId);
    setError(null);
    const res = await fetch(`/api/threads/${s.threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: s.suggestedStage }),
    }).catch(() => null);
    setPending(null);

    if (!res?.ok) {
      setError(`Couldn't move ${s.company} to ${s.suggestedStage}.`);
      return;
    }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          Looks like this moved
        </h2>
        <p className="text-xs text-ink/40">from your calendar</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((s) => (
          <div
            key={s.threadId}
            className="border border-line rounded-xl p-4 bg-white flex flex-col gap-2"
          >
            <div>
              <p className="font-medium">
                {s.company}: {s.currentStage} → {s.suggestedStage}
              </p>
              <p className="text-sm text-ink/60">{s.because}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => confirm(s)}
                disabled={pending === s.threadId}
                className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                {pending === s.threadId ? "Moving…" : `Move to ${s.suggestedStage}`}
              </button>
              <button
                onClick={() => setDismissed((d) => [...d, s.threadId])}
                className="text-sm text-ink/50"
              >
                Not now
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
