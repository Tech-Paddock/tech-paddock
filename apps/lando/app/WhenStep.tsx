"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import { FUTURE_NOTICE, isFutureDay, isFutureWhen } from "@/lib/future";
import { dateLabel, fromLocalInput, toDateInput, toLocalInput, whenLabel } from "@/lib/localtime";

/** What a person chose in the step. `keep` is the time the form opened on, kept exactly (an entry's own, or a Done's). */
export type WhenChoice = { kind: "keep" } | { kind: "now" } | { kind: "at"; value: string };

/** True when a picked value (a day for a date-only form, else a local date and time) is after now. */
export function isFuturePick(value: string, dateOnly: boolean, now: Date): boolean {
  if (!value) return false;
  if (dateOnly) return isFutureDay(value, toDateInput(now.toISOString()));
  const at = fromLocalInput(value);
  return isFutureWhen(at ? new Date(at) : null, now);
}

/**
 * The When step (TEC-252): a short nested sheet that Save opens over a form, on every form. A big focused
 * button logs it now, or "or another time" takes a date and time with its own Save. A future time still makes a
 * plan (the notice says so, and `repeat` shows under it). A form that opened on a time of its own (a correction,
 * a Done, a Calendar plan) puts that time on the big button instead of Now, and the field opens on it.
 * Date-only forms (Weight) get a date. A failed save leaves the step open, on the same choice, with the reason.
 * A local pattern; the form owns the save, this only asks.
 */
export default function WhenStep({
  dateOnly,
  initial,
  stored,
  editing,
  allowFuture = true,
  planning = false,
  check,
  repeat,
  busy,
  error,
  onChoose,
  onBack,
}: {
  dateOnly: boolean;
  /** The field's first value: a `datetime-local` string, or a `YYYY-MM-DD` day for a date-only form. */
  initial: string;
  /** The form opened on a time of its own: the big button keeps it, and Now is the small one. */
  stored: boolean;
  /** A saved entry or note being corrected: the big button says Keep. */
  editing: boolean;
  /** False for a note, which is never in the future. */
  allowFuture?: boolean;
  /** An open plan is being edited: its Repeat shows whatever the time. */
  planning?: boolean;
  /** A reason the picked value can't be used, shown and blocking the field's Save. */
  check?: (value: string) => string | null;
  /** Shown while the choice is a plan: the form's Repeat. */
  repeat?: React.ReactNode;
  busy: boolean;
  error: string | null;
  onChoose: (choice: WhenChoice) => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState(initial);
  const now = new Date();
  const future = allowFuture && isFuturePick(value, dateOnly, now);
  const problem = check ? check(value) : null;
  const label = dateOnly ? dateLabel(initial, now) : whenLabel(initial, now);
  const nowWord = dateOnly ? "Today" : "Now";
  const big = "min-h-[56px] rounded-[14px] bg-accent px-4 text-xl font-bold text-accent-ink disabled:opacity-60";
  return (
    <Sheet nested title="When?" onClose={onBack}>
      <div className="flex flex-col gap-3" data-section="when-step">
        {stored ? (
          <>
            <button type="button" data-autofocus disabled={busy} onClick={() => onChoose({ kind: "keep" })} className={big}>
              {busy ? "Saving…" : `${editing ? "Keep" : "Use"} ${label || "this time"}`}
            </button>
            <button type="button" disabled={busy} onClick={() => onChoose({ kind: "now" })} className="min-h-[44px] self-center px-3 font-semibold text-ink underline disabled:opacity-60">
              {nowWord} instead
            </button>
          </>
        ) : (
          <button type="button" data-autofocus disabled={busy} onClick={() => onChoose({ kind: "now" })} className={big}>
            {busy ? "Saving…" : nowWord}
          </button>
        )}
        <p className="text-center text-[13px] text-ink-soft">or another time</p>
        <div className="flex items-center gap-2">
          <input
            aria-label={dateOnly ? "Date" : "Date and time"}
            type={dateOnly ? "date" : "datetime-local"}
            value={value}
            max={allowFuture ? undefined : dateOnly ? toDateInput(now.toISOString()) : toLocalInput(now.toISOString())}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[44px] min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 py-1.5 text-[15px] outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={busy || !value || !!problem}
            onClick={() => onChoose({ kind: "at", value })}
            className="min-h-[44px] rounded-[10px] border border-line bg-surface px-4 font-semibold disabled:opacity-60"
          >
            Save
          </button>
        </div>
        {problem ? (
          <p role="status" className="text-[13px] font-semibold text-danger">
            {problem}
          </p>
        ) : (
          <p role="status" className={`text-[13px] ${future ? "font-semibold text-ink" : "text-ink-soft"}`}>
            {future ? FUTURE_NOTICE : allowFuture ? "Earlier logs it then. A future time saves it as upcoming." : "Earlier logs it then."}
          </p>
        )}
        {(future || planning) && repeat}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="button" onClick={onBack} disabled={busy} className="min-h-[44px] self-start text-ink-soft underline disabled:opacity-60">
          Back to the form
        </button>
      </div>
    </Sheet>
  );
}
