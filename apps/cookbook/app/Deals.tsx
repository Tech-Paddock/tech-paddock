"use client";

import { MODALITIES, modalityWord, type Modality } from "@/lib/modality";
import type { Estimate } from "@/lib/pricing";

/**
 * The list tab's prices (TEC-121): the Pickup/Delivery toggle and the estimated
 * total. The deal results moved to the Deals tab (TEC-132). Presentational only; `Cart.tsx` owns the requests,
 * so every Kroger call still runs one at a time from one place.
 *
 * Local patterns, named so they are a decision deferred rather than drift: the
 * two-button **mode toggle** (a segmented control, `aria-pressed`), the
 * **estimate panel** (priced and unpriced lines). They reuse the
 * theme's tokens only.
 */

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

const LINK = "underline decoration-dotted underline-offset-2";

export function ModeToggle({ value, onChange, disabled }: { value: Modality; onChange: (m: Modality) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Pickup or delivery" className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
      {MODALITIES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          disabled={disabled}
          onClick={() => value !== m && onChange(m)}
          className={`px-3 py-1.5 capitalize disabled:opacity-50 ${value === m ? "bg-accent font-semibold text-accent-ink" : "text-ink-soft"}`}
        >
          {modalityWord(m)}
        </button>
      ))}
    </div>
  );
}

export function EstimatePanel({ estimate, message, onClose }: { estimate: Estimate; message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      {/* **Labelled an estimate**, and the sentence names every unpriced line. */}
      <h3 className="text-sm font-semibold">{message}</h3>
      {estimate.priced.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs">
          {estimate.priced.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1">
                {p.name} <span className="text-ink-soft">×{p.quantity} —{" "}
                  <a href={p.url} target="_blank" rel="noreferrer" className={LINK}>
                    {p.description}
                  </a>
                  {" "}at {money(p.unit)}
                  {p.onSale ? <span className="text-accent"> · on sale</span> : null}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{money(p.lineTotal)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {estimate.unpriced.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-warn">
          {estimate.unpriced.map((u) => (
            <li key={u.id}>
              {u.name} ×{u.quantity} — unpriced: {u.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <button type="button" onClick={onClose} className="text-xs text-ink-soft underline decoration-dotted underline-offset-2">
          Hide
        </button>
      </div>
    </div>
  );
}
