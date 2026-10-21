"use client";

import { couponsUrl } from "@/lib/kingsoopers";
import { MODALITIES, modalityWord, type Modality } from "@/lib/modality";
import type { Estimate, ScanRecord } from "@/lib/pricing";

/**
 * The list tab's prices (TEC-121): the Pickup/Delivery toggle, the estimated
 * total, and the deal scan. Presentational only; `Cart.tsx` owns the requests,
 * so every Kroger call still runs one at a time from one place.
 *
 * Local patterns, named so they are a decision deferred rather than drift: the
 * two-button **mode toggle** (a segmented control, `aria-pressed`), the
 * **estimate panel** (priced and unpriced lines), and the **deal rows** (sale
 * price, struck regular price, percent-off chip, two links). They reuse the
 * theme's tokens only.
 */

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

export function DealsPanel(props: {
  latest: ScanRecord | null;
  loaded: boolean;
  scanning: boolean;
  note: { text: string; failed: boolean } | null;
  onScan: () => void;
}) {
  const { latest } = props;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Deals{latest?.store_name ? ` at ${latest.store_name}` : ""}</h3>
        <span className="text-xs text-ink-soft">
          {latest ? `scanned ${when(latest.ran_at)}` : props.loaded ? "not scanned yet" : "reading…"}
        </span>
        <button
          type="button"
          onClick={props.onScan}
          disabled={props.scanning}
          className="ml-auto rounded border border-line px-2 py-1 text-xs disabled:opacity-50"
        >
          {props.scanning ? "Scanning…" : "Scan for deals"}
        </button>
      </div>

      {props.note ? (
        <p role={props.note.failed ? "alert" : undefined} className={`text-xs ${props.note.failed ? "text-danger" : "text-ink-soft"}`}>
          {props.note.text}
        </p>
      ) : null}

      {latest ? (
        latest.deals.length === 0 ? (
          <p className="text-xs text-ink-soft">Nothing from your brands or the list was on sale in that scan.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {latest.deals.map((d) => (
              <li key={d.productId} className="flex flex-col gap-0.5 py-1.5 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded border border-accent px-1.5 text-[11px] text-accent">−{d.percentOff}%</span>
                  <a href={d.url} target="_blank" rel="noreferrer" className={`min-w-0 flex-1 ${LINK}`}>
                    {d.description}
                  </a>
                </div>
                <span className="text-xs text-ink-soft">
                  <b className="text-ink">{money(d.promo)}</b> <s>{money(d.regular)}</s>
                  {d.size ? ` · ${d.size}` : ""}
                  {d.endsAt ? ` · until ${day(d.endsAt)}` : ""} · for {d.for.join(", ")} ·{" "}
                  <a href={couponsUrl(d.for[0] ?? d.description)} target="_blank" rel="noreferrer" className={LINK}>
                    Find coupons
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {latest && (latest.unpriced.length > 0 || latest.failed.length > 0) ? (
        <p className="text-[11px] text-ink-soft">
          {latest.unpriced.length > 0 ? `No price at the store: ${latest.unpriced.join(", ")}. ` : ""}
          {latest.failed.length > 0 ? `Couldn't check: ${latest.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}.` : ""}
        </p>
      ) : null}

      <p className="text-[11px] text-ink-soft">
        Sale prices are Kroger&rsquo;s, at your store, for your brands and the list. Coupons can&rsquo;t be read from here;
        Find coupons opens King Soopers&rsquo; coupon search. A scan runs when you open the list a week after the last.
      </p>
    </div>
  );
}
