"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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
 * Reads what the picker returned. A form that opened on a time of its own (`stored`: a correction, a Done, a
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
   * Opens the phone's own picker. `preset` is the time the form opened on (a stored one), or null for a new
   * entry, which the picker opens on now by itself. Must be called from a tap, or the browser refuses it.
   */
  ask: (preset: string | null) => void;
};

/**
 * Save asks the time here (TEC-255, replacing TEC-252's When step): the native date-and-time picker (a date on
 * Weight), opened with `showPicker()` on a hidden field, and confirming it saves. If the browser refuses
 * `showPicker`, a small sheet holds the same native field with its own Save. A future time still makes a plan
 * (the form handles it). A local pattern; the form owns the save, this only asks.
 *
 * A new entry opens the picker on an empty field, which a browser fills with now: a field already holding now
 * fires no change when it is confirmed unchanged, and a confirm that saved nothing would be a lost tap. A stored
 * time has to be preset, and a browser reports no change when it is confirmed as it is, so the sheet opens beside
 * the picker for a stored time, holding the same field and a "Use this time" button: confirming a new time saves
 * and closes it, and dismissing the picker unchanged leaves it there to tap. (The sheet never takes the focus
 * from the field then, or the picker would close.)
 */
const WhenAsk = forwardRef<
  WhenAskHandle,
  {
    dateOnly: boolean;
    /** False for a note, which is never in the future: the field's `max`, and the sheet's notice. */
    allowFuture?: boolean;
    /** A reason a picked value can't be used, shown in the fallback sheet and blocking its Save. */
    check?: (value: string) => string | null;
    onPick: (value: string) => void;
  }
>(function WhenAsk({ dateOnly, allowFuture = true, check, onPick }, ref) {
  const field = useRef<HTMLInputElement>(null);
  // The sheet's value; null while it is closed. `beside` is a stored time, the picker open over it.
  const [sheet, setSheet] = useState<{ value: string; beside: boolean } | null>(null);
  const type = dateOnly ? "date" : "datetime-local";
  const maxNow = () => (dateOnly ? toDateInput(new Date().toISOString()) : toLocalInput(new Date().toISOString()));

  useImperativeHandle(ref, () => ({
    ask(preset) {
      const el = field.current;
      if (el && typeof el.showPicker === "function") {
        try {
          el.value = preset ?? "";
          el.showPicker();
          // A stored time also shows the sheet, for the unchanged confirm the field cannot report.
          if (preset !== null) setSheet({ value: preset, beside: true });
          return;
        } catch {
          // Refused (not from a tap, or this browser's field): the sheet below holds the native field instead.
        }
      }
      setSheet({ value: preset ?? maxNow(), beside: false });
    },
  }));

  const future = sheet !== null && allowFuture && isFuturePick(sheet.value, dateOnly, new Date());
  const problem = sheet !== null && check ? check(sheet.value) : null;
  return (
    <>
      <input
        ref={field}
        data-when-picker
        type={type}
        tabIndex={-1}
        aria-hidden="true"
        max={allowFuture ? undefined : maxNow()}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          // Cleared at once, so picking the same time again (after a failure) still reports a change.
          e.target.value = "";
          setSheet(null);
          onPick(v);
        }}
        // Beside the bottom row, so the picker opens there; never seen, never focused, never in the way of a tap.
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
      {sheet !== null && (
        <Sheet nested title="When?" moveFocus={!sheet.beside} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-2" data-section="when-sheet">
            <input
              aria-label={dateOnly ? "Date" : "Date and time"}
              type={type}
              value={sheet.value}
              max={allowFuture ? undefined : maxNow()}
              data-autofocus
              onChange={(e) => setSheet({ ...sheet, value: e.target.value })}
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
                {sheet.beside ? "Use this time" : "Save"}
              </button>
              <button type="button" onClick={() => setSheet(null)} className="h-[44px] px-2 text-ink-soft underline">
                Back to the form
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
});

export default WhenAsk;
