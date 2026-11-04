"use client";

import { useEffect, useState } from "react";
import type { MatchView } from "@/lib/itemMatches";
import { SheetFrame, serialKroger } from "./Cart";

const LINK_BUTTON = "min-h-11 self-start rounded-[10px] px-2 text-[15px] text-accent underline-offset-2 hover:underline";

/**
 * **The popup behind a grocery item's name** (TEC-226; owner, 2026-11-04). The same sheet as the
 * Which-chicken picker (`SheetFrame`), but it only browses: each product is a link to its King
 * Soopers page, opened in a new tab, which a phone hands to the King Soopers app. **Nothing here
 * adds to the cart or sets a default.** `fallback` is the search link the list already holds,
 * used while loading and when the look-up fails, so a tap always has somewhere to go.
 */
export function ItemMatches({ id, name, fallback, onClose }: { id: string; name: string; fallback: string; onClose: () => void }) {
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

  const searchHref = view?.searchHref ?? fallback;

  return (
    <SheetFrame label={`${name} at King Soopers`} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-bold">{name}</h2>
        <p className="text-[13px] text-ink-soft">Tap a product to open it in King Soopers. Nothing is added to the cart.</p>
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
                  <a
                    href={o.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line bg-raised px-3 py-2.5 text-left text-ink"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-semibold">{o.label}</span>
                      <span className="text-xs text-ink-soft">{o.detail || "not priced yet"}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold">{o.tag}</span>
                  </a>
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
        <button type="button" onClick={onClose} className={LINK_BUTTON}>
          Close
        </button>
      </div>
    </SheetFrame>
  );
}
