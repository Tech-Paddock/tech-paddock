"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { localDay } from "@/lib/days";
import type { Today as TodayData } from "@/lib/types";
import JournalBox from "./JournalBox";
import Meditation from "./Meditation";
import { NotSaved, useOutbox } from "./outbox";
import Routines from "./Routines";
import Tasks from "./Tasks";

/**
 * Today (RULES.md, Surface: app): one screen, opening on the current day. The
 * day is the device's own calendar day, read after mount (the server cannot
 * know it) and checked again whenever the app comes back to the foreground, so
 * a page left open past midnight turns over. Everything on it comes from one
 * read, repeated after every save.
 */
export default function Today() {
  const [day, setDay] = useState<string | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);
  const dayRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const d = dayRef.current;
    if (!d) return;
    try {
      const res = await fetch(`/api/today?day=${d}`, { cache: "no-store" });
      if (!res.ok) throw new Error("read failed");
      const next = (await res.json()) as TodayData;
      if (dayRef.current === d) setData(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  const { send, retry, discard, failed: unsaved, busy } = useOutbox(load);

  useEffect(() => {
    const check = () => {
      const d = localDay();
      if (d !== dayRef.current) {
        dayRef.current = d;
        setData(null);
        setDay(d);
        void load();
      }
    };
    check();
    const visible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [load]);

  return (
    <>
      <NotSaved failed={unsaved} retry={(op) => void retry(op)} discard={discard} />
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-24 pt-4">
        {busy > 0 && (
          <p role="status" className="text-sm text-ink/70">
            Saving…
          </p>
        )}
        {failed && (
          <p role="alert" className="flex items-center gap-3 rounded-lg border border-urgent px-3 py-2 text-sm">
            <span className="flex-1">{data ? "Couldn't refresh today." : "Couldn't load today."}</span>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink">
              Retry
            </button>
          </p>
        )}
        {!data || !day ? (
          !failed && <p className="py-10 text-center text-ink/70">Loading today…</p>
        ) : (
          <>
            <Tasks tasks={data.tasks} day={day} send={send} />
            <Routines routines={data.routines} day={day} send={send} />
            <JournalBox entries={data.journal} day={day} send={send} />
            <Meditation streak={data.meditation.streak} sessions={data.meditation.sessions} day={day} send={send} />
          </>
        )}
        <Link href="/more" className="flex min-h-11 items-center justify-center text-sm text-ink/70 underline">
          Goals and lists
        </Link>
      </div>
    </>
  );
}
