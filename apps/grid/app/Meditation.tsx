"use client";

import { useEffect, useRef, useState } from "react";
import { makeAudio, playChime } from "@/lib/chime";
import { breathAt, clock, DEFAULT_LENGTH_MIN, LENGTHS_MIN, remainingSeconds } from "@/lib/meditation";
import type { Session } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import { keepAwake } from "@/lib/wakelock";
import type { Send } from "./outbox";

/**
 * The timer (RULES.md, Surface). Choose a length, and a full-screen sitting
 * begins: a circle that slowly grows and shrinks (4 seconds in, 6 out), the time
 * left, the screen held awake, and a chime at the end. Each sitting is logged,
 * finished or ended early, through the outbox, so a failed log shows a Retry and
 * never reads as logged.
 *
 * - **Reduced motion is CSS's call** (globals.css): the circle's animation is
 *   written only under `prefers-reduced-motion: no-preference`, and the text
 *   count (`.grid-count`) is shown only otherwise. The component holds the one
 *   markup for both.
 * - **The time left comes from timestamps, not ticks**, so a throttled or
 *   backgrounded tab still ends on time.
 * - Wake lock and chime are phone-only behaviour: not proven by a test, they
 *   wait on the owner's check on a phone.
 */
type Sitting = { id: string; startedAt: number; seconds: number };

export default function Meditation({
  streak,
  sessions,
  day,
  send,
}: {
  streak: number;
  sessions: Session[];
  day: string;
  send: Send;
}) {
  const [minutes, setMinutes] = useState<number>(DEFAULT_LENGTH_MIN);
  const [sitting, setSitting] = useState<Sitting | null>(null);
  const [now, setNow] = useState(0);
  const [ended, setEnded] = useState<"done" | "early" | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);
  const finishing = useRef(false);

  const left = sitting ? remainingSeconds(sitting.startedAt, sitting.seconds, now) : 0;
  const elapsed = sitting ? Math.min(sitting.seconds, Math.floor((now - sitting.startedAt) / 1000)) : 0;

  function releaseLock() {
    void lock.current?.release().catch(() => {});
    lock.current = null;
  }

  function finish(s: Sitting, finished: boolean, ranFor: number) {
    if (finishing.current) return;
    finishing.current = true;
    releaseLock();
    if (finished) playChime(audio.current);
    setEnded(finished ? "done" : "early");
    void send(finished ? "Meditation session" : "Meditation session (ended early)", "/api/meditation", {
      op: "log",
      id: s.id,
      day,
      planned_seconds: s.seconds,
      elapsed_seconds: Math.min(s.seconds, Math.max(0, Math.round(ranFor))),
      finished,
    });
  }

  async function start() {
    finishing.current = false;
    audio.current = makeAudio();
    const t = Date.now();
    setNow(t);
    setEnded(null);
    setSitting({ id: uuid(), startedAt: t, seconds: minutes * 60 });
    lock.current = await keepAwake();
  }

  function close() {
    setSitting(null);
    setEnded(null);
    // Closed after the last strike has rung out, so a quick Close does not cut it off.
    const ctx = audio.current;
    audio.current = null;
    if (ctx) window.setTimeout(() => void ctx.close().catch(() => {}), 4000);
  }

  // The clock. A quarter-second tick; the sums come from timestamps.
  useEffect(() => {
    if (!sitting || ended) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (remainingSeconds(sitting.startedAt, sitting.seconds, t) === 0) finish(sitting, true, sitting.seconds);
    };
    const id = window.setInterval(tick, 250);
    // The browser drops the wake lock when the page is hidden: ask again on return.
    const visible = async () => {
      if (document.visibilityState === "visible") {
        tick();
        if (!lock.current) lock.current = await keepAwake();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", visible);
    };
    // finish() closes over the day and the outbox only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitting, ended]);

  useEffect(() => releaseLock, []);

  const minutesToday = Math.round(sessions.reduce((n, s) => n + s.elapsed_seconds, 0) / 60);
  const breath = breathAt(elapsed);

  return (
    <section aria-labelledby="meditate-h" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="meditate-h" className="text-lg font-semibold">
          Meditation
        </h2>
        <span className="text-sm text-ink/70" aria-label={`Streak: ${streak} ${streak === 1 ? "day" : "days"}`}>
          {streak > 0 ? `Streak ${streak} ${streak === 1 ? "day" : "days"}` : "No streak yet"}
        </span>
      </div>
      <div role="radiogroup" aria-label="Length" className="mt-3 grid grid-cols-3 gap-2">
        {LENGTHS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={minutes === m}
            onClick={() => setMinutes(m)}
            className={`min-h-11 rounded-lg border font-medium ${minutes === m ? "border-accent bg-accent text-accent-ink" : "border-line bg-paper"}`}
          >
            {m} min
          </button>
        ))}
      </div>
      <button type="button" onClick={start} className="mt-3 min-h-12 w-full rounded-lg bg-accent px-4 text-lg font-medium text-accent-ink">
        Begin
      </button>
      {minutesToday > 0 && (
        <p className="mt-2 text-sm text-ink/70">
          Today: {minutesToday} {minutesToday === 1 ? "minute" : "minutes"}, {sessions.length} {sessions.length === 1 ? "sitting" : "sittings"}
        </p>
      )}

      {sitting && (
        <div role="dialog" aria-modal="true" aria-label="Meditation" className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-paper px-6 py-10">
          <p className="text-4xl font-light tabular-nums" aria-live="off">
            {ended ? (ended === "done" ? "Done" : "Ended") : clock(left)}
          </p>
          <div className="flex flex-col items-center gap-6">
            <div className="grid-circle-wrap" aria-hidden="true">
              <div className={`grid-circle${ended ? " grid-circle-still" : ""}`} />
            </div>
            {!ended && (
              <p className="grid-count text-2xl" aria-hidden="true">
                {breath.word} <span className="tabular-nums">{breath.count}</span>
              </p>
            )}
            {ended && (
              <p className="text-center text-ink/70">
                {ended === "done" ? "Well done. Your sitting is logged." : "Your sitting is logged."}
              </p>
            )}
          </div>
          {ended ? (
            <button type="button" onClick={close} className="min-h-12 w-full max-w-sm rounded-lg bg-accent px-4 text-lg font-medium text-accent-ink">
              Close
            </button>
          ) : (
            <button
              type="button"
              onClick={() => sitting && finish(sitting, false, elapsed)}
              className="min-h-12 w-full max-w-sm rounded-lg border border-line px-4 text-lg"
            >
              End early
            </button>
          )}
        </div>
      )}
    </section>
  );
}
