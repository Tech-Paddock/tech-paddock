"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import Sheet from "./Sheet";
import { FUTURE_NOTICE, isFutureDay, isFutureWhen } from "@/lib/future";
import { fromLocalInput, toDateInput, toLocalInput } from "@/lib/localtime";

/** What a person chose. `keep` is the time the form opened on, kept exactly (an entry's own, or a Done's); `now` is the moment of the save. */
export type WhenChoice = { kind: "keep" } | { kind: "now" } | { kind: "at"; value: string };

/** True when a picked value (a day for a date-only form, else a local date and time) is after now. */
export function isFuturePick(value: string, dateOnly: boolean, now: Date): boolean {
  if (!value) return false;
  if (dateOnly) return isFutureDay(value, toDateInput(now.toISOString()));
  const at = fromLocalInput(value);
  return isFutureWhen(at ? new Date(at) : null, now);
}

/**
 * Reads what the sheet returned. A form that opened on a time of its own (`stored`: a correction, a Done, a
 * Calendar plan) and gets that same value back keeps it exactly, to the millisecond (the native field holds minutes
 * only, and `treatsWith` matches on the entry's own time). A new entry given this minute is "now": the moment of the
 * save. Anything else is a time that was picked.
 */
export function classifyPick(value: string, o: { dateOnly: boolean; stored: boolean; initial: string; now: Date }): WhenChoice {
  if (o.stored && value === o.initial) return { kind: "keep" };
  const nowValue = o.dateOnly ? toDateInput(o.now.toISOString()) : toLocalInput(o.now.toISOString());
  if (!o.stored && value === nowValue) return { kind: "now" };
  return { kind: "at", value };
}

export type WhenAskHandle = {
  /**
   * Opens the When sheet. `preset` is the time the form opened on (a stored one), or null for a new entry, which
   * opens on now. Must be called from a tap.
   */
  ask: (preset: string | null) => void;
};

/**
 * Save asks the time here (TEC-258, after TEC-255): it always opens a small When sheet holding the native
 * date-and-time field (a date on Weight) and a Save. Tapping the field opens the phone's own wheel; Save confirms
 * it. A hidden field opened with `showPicker()` is gone: a phone neither throws nor reports a `change` for one, so
 * nothing saved. A future time still makes a plan (the form handles it). A local pattern; the form owns the save,
 * this only asks.
 */
const WhenAsk = forwardRef<
  WhenAskHandle,
  {
    dateOnly: boolean;
    /** False for a note, which is never in the future: the field's `max`, and the sheet's notice. */
    allowFuture?: boolean;
    /** A reason a picked value can't be used, shown in the sheet and blocking its Save. */
    check?: (value: string) => string | null;
    onPick: (value: string) => void;
  }
>(function WhenAsk({ dateOnly, allowFuture = true, check, onPick }, ref) {
  // The sheet's value; null while it is closed.
  const [sheet, setSheet] = useState<{ value: string } | null>(null);
  const type = dateOnly ? "date" : "datetime-local";
  const maxNow = () => (dateOnly ? toDateInput(new Date().toISOString()) : toLocalInput(new Date().toISOString()));

  useImperativeHandle(ref, () => ({
    ask(preset) {
      setSheet({ value: preset ?? maxNow() });
    },
  }));

  const future = sheet !== null && allowFuture && isFuturePick(sheet.value, dateOnly, new Date());
  const problem = sheet !== null && check ? check(sheet.value) : null;
  if (sheet === null) return null;
  return (
    <Sheet nested title="When?" onClose={() => setSheet(null)}>
      <div className="flex flex-col gap-2" data-section="when-sheet">
        <input
          aria-label={dateOnly ? "Date" : "Date and time"}
          type={type}
          value={sheet.value}
          max={allowFuture ? undefined : maxNow()}
          data-autofocus
          onChange={(e) => setSheet({ value: e.target.value })}
          className="h-[44px] w-1/2 min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[15px] outline-none focus:border-accent"
        />
        {problem ? (
          <p role="status" className="text-[13px] font-semibold text-danger">
            {problem}
          </p>
        ) : (
          <p role="status" className={`text-[13px] ${future ? "font-semibold text-ink" : "text-ink-soft"}`}>
            {future ? FUTURE_NOTICE : allowFuture ? "A future time saves it as upcoming." : "A note is never in the future."}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!sheet.value || !!problem}
            onClick={() => {
              const v = sheet.value;
              setSheet(null);
              if (v) onPick(v);
            }}
            className="h-[44px] rounded-[10px] bg-accent px-4 font-bold text-accent-ink disabled:opacity-60"
          >
            Save
          </button>
          <button type="button" onClick={() => setSheet(null)} className="h-[44px] px-2 text-ink-soft underline">
            Back to the form
          </button>
        </div>
      </div>
    </Sheet>
  );
});

export default WhenAsk;
