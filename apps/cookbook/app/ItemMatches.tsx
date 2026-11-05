"use client";

import { useEffect, useState } from "react";
import type { MatchOption, MatchView } from "@/lib/itemMatches";
import type { PickedProduct } from "@/lib/linePick";
import { SheetFrame, serialKroger } from "./Cart";

const LINK_BUTTON = "min-h-11 self-start rounded-[10px] px-2 text-[15px] text-accent underline-offset-2 hover:underline";

/** What a tap on an option stores for the line (`PATCH /api/grocery`, `readPicked`). */
export function pickOfOption(o: MatchOption): PickedProduct {
  return { upc: o.upc, url: o.url, label: o.label, size: o.size, price: o.price };
}

/**
 * **The popup behind a grocery item's name** (TEC-226, changed by TEC-227; owner, 2026-11-04:
 * "tapping the item should select confirm it in the list. So if there are multiple options this is
 * where you select. Search KS is great don't change that. No close button. Add an x at the top and
 * allow clicking out of the window to close. Bring why and price inline and make pill smaller.").
 *
 * A tap on a product **picks it for this line** (`onPick`), so + Cart and Send all send it; it is not
 * made a default ("This line only"). The picked product shows as selected, and a tap on it clears the
 * pick. **Search King Soopers is unchanged.** An × at the top closes it, and so do a tap outside it and
 * Escape; there is no Close button. `fallback` is the search link the list already holds, used while
 * loading and when the look-up fails, so a tap always has somewhere to go.
 */
export function ItemMatches({
  id,
  name,
  fallback,
  onPick,
  onClose,
}: {
  id: string;
  name: string;
  fallback: string;
  /** The product to use for this line, or null to go back to the automatic pick. */
  onPick: (picked: PickedProduct | null) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await serialKroger(() => fetch(`/api/kroger/matches?id=${encodeURIComponent(id)}`, { cache: "no-store" }));
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't look up the matches.");
        if (live) setView(body as MatchView);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't look up the matches.");
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <SheetFrame label={`${name} at King Soopers`} onClose={onClose} closeOnBackdrop>
      <MatchesBody name={name} view={view} error={error} fallback={fallback} onPick={onPick} onClose={onClose} />
    </SheetFrame>
  );
}

/** The popup's content. No state, so it renders (and is tested) on its own. */
export function MatchesBody({
  name,
  view,
  error,
  fallback,
  onPick,
  onClose,
}: {
  name: string;
  view: MatchView | null;
  error: string | null;
  fallback: string;
  onPick: (picked: PickedProduct | null) => void;
  onClose: () => void;
}) {
  const searchHref = view?.searchHref ?? fallback;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="text-[13px] text-ink-soft">Tap a product to use it for this line. Tap the picked one again to go back to the automatic pick.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-2xl leading-none text-ink-soft">
          ×
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : !view ? (
        <p role="status" className="text-[13px] text-ink-soft">
          Looking up matches…
        </p>
      ) : (
        <>
          {view.note ? <p className="text-[13px] text-ink-soft">{view.note}</p> : null}
          {view.options.length > 0 ? (
            <ul aria-label={`${name} matches`} className="flex flex-col gap-1.5">
              {view.options.map((o) => (
                <li key={o.upc}>
                  {/* **One line**: name · size · price, with why as a small pill on the same line. */}
                  <button
                    type="button"
                    aria-pressed={o.selected}
                    onClick={() => onPick(o.selected ? null : pickOfOption(o))}
                    title={[o.label, o.detail, o.tag].filter(Boolean).join(" · ")}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-[10px] bg-raised px-3 py-2 text-left text-ink ${o.selected ? "border-2 border-accent" : "border border-line"}`}
                  >
                    <span aria-hidden="true" className={`w-4 shrink-0 text-sm font-bold ${o.selected ? "text-accent" : "text-transparent"}`}>
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {o.label}
                      <span className="font-normal text-ink-soft"> · {o.detail || "not priced yet"}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">{o.tag}</span>
                    {o.selected ? <span className="sr-only">Picked for this line</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        <a href={searchHref} target="_blank" rel="noreferrer" className={`${LINK_BUTTON} inline-flex items-center`}>
          Search King Soopers
        </a>
      </div>
    </>
  );
}
