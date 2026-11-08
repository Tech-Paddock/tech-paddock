"use client";

import { useState } from "react";
import { formForItem } from "@/lib/future";
import { planTone } from "@/lib/calendar";
import { UPCOMING_TONE_WORDS, detailLine, dueText, titleLine, upcomingTone, type Upcoming } from "@/lib/upcoming";

/**
 * Upcoming items as rows (TEC-199): the Log screen's Next 7 days box and the feed's Upcoming filter share it.
 * Each row wears the pills' status colours (`.lando-pill[data-status]`: amber within 7 days, red when overdue,
 * neutral beyond). The first line is "Title · note", cut off with an ellipsis; the second is when it is due,
 * "overdue" and how it repeats (TEC-203). Tapping the words opens the item in its form to edit in place (an old
 * item with its own words and no form of its own has no edit). Done opens the form the item came from
 * (`doneUpcoming` in Journal). The filter's rows also have Cancel: an item is cancelled, never deleted.
 * The colour is never the only cue: the tone is in words for screen readers. A local pattern.
 *
 * `compact` (TEC-250, the Log's Next 7 days): each plan is one short line, a dot in its form's colour, the name and
 * when, and a small Done; no card border, no detail line, no big button. Tapping the line edits it, as above. An
 * overdue plan's time is red. Each control keeps a 44px hit area; only the Done pill looks small. A local pattern.
 */
export default function UpcomingList({
  items,
  today,
  onDone,
  onEdit,
  onCancel,
  compact,
}: {
  items: Upcoming[];
  today: string;
  onDone: (item: Upcoming) => Promise<{ error: string | null } | void>;
  onEdit?: (item: Upcoming) => void;
  onCancel?: (id: string) => Promise<{ error: string | null }>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function run(id: string, act: () => Promise<{ error: string | null } | void>) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    const result = await act();
    setBusy(null);
    if (result && result.error) setErrors((e) => ({ ...e, [id]: result.error! }));
  }

  if (compact) {
    return (
      <ul className="flex flex-col">
        {items.map((i) => {
          const tone = upcomingTone(i, today);
          const kind = planTone(i);
          const words = (
            <>
              <i data-kind={kind ?? undefined} aria-hidden="true" className={`lando-cal-dot mr-1.5 shrink-0 ${kind ? "" : "text-ink-soft"}`} />
              <span className="min-w-0 truncate">
                <b>{i.title}</b>
                {tone && <span className="sr-only">, {UPCOMING_TONE_WORDS[tone]}</span>}{" "}
                <span className={tone === "red" ? "font-semibold text-danger" : "text-ink-soft"}>{dueText(i)}</span>
              </span>
            </>
          );
          return (
            <li key={i.id} className="border-b border-line/40 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                {onEdit && formForItem(i) ? (
                  <button type="button" onClick={() => onEdit(i)} title={titleLine(i)} className="flex min-h-[44px] min-w-0 flex-1 items-center text-left text-[15px]">
                    <span className="sr-only">Edit </span>
                    {words}
                  </button>
                ) : (
                  <div className="flex min-h-[44px] min-w-0 flex-1 items-center text-[15px]">{words}</div>
                )}
                <button
                  type="button"
                  disabled={busy === i.id}
                  onClick={() => void run(i.id, () => onDone(i))}
                  aria-label={`Done: ${i.title}`}
                  className="grid min-h-[44px] shrink-0 place-items-center px-1 disabled:opacity-60"
                >
                  <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] font-semibold">Done</span>
                </button>
              </div>
              {errors[i.id] && <div className="pb-1 text-[13px] font-semibold text-danger">{errors[i.id]}</div>}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((i) => {
        const tone = upcomingTone(i, today);
        const words = (
          <>
            <div className="truncate">
              <b>{i.title}</b>
              {/* Right after the title: an absolutely placed span far along a long line would widen the page. */}
              {tone && <span className="sr-only">, {UPCOMING_TONE_WORDS[tone]}</span>}
              {i.note && <span className="text-ink-soft"> · {i.note}</span>}
            </div>
            <div className="truncate text-sm text-ink-soft">{detailLine(i, tone)}</div>
          </>
        );
        return (
          <li
            key={i.id}
            data-status={tone ?? undefined}
            className="lando-pill grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border border-line bg-surface px-2.5 py-1"
          >
            <div className="min-w-0">
              {onEdit && formForItem(i) ? (
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  title={titleLine(i)}
                  className="block min-h-[44px] w-full min-w-0 py-1 text-left"
                >
                  <span className="sr-only">Edit </span>
                  {words}
                </button>
              ) : (
                <div className="py-1">{words}</div>
              )}
              {errors[i.id] && <div className="text-[13px] font-semibold text-danger">{errors[i.id]}</div>}
            </div>
            <div className="flex items-center gap-1">
              {onCancel && (
                <button
                  type="button"
                  disabled={busy === i.id}
                  onClick={() => void run(i.id, () => onCancel(i.id))}
                  aria-label={`Cancel ${i.title}`}
                  className="min-h-[44px] px-1.5 text-sm text-ink-soft disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                disabled={busy === i.id}
                onClick={() => void run(i.id, () => onDone(i))}
                aria-label={`Done: ${i.title}`}
                className="min-h-[44px] rounded-[10px] bg-accent px-3 font-semibold text-accent-ink disabled:opacity-60"
              >
                Done
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
