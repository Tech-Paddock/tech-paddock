"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DealBoard, DealRow } from "@/lib/dealRows";
import { listDeals } from "@/lib/listDeals";
import { ALL_AISLES, NO_FILTER, groupByAisle, matchesFilter, type DealFilter, type Kind, type LightFilter } from "@/lib/dealFilter";

/**
 * Deals (TEC-132), at `/deals`: every saved product with a recent price,
 * coloured against its own last twelve weeks, from the owner's mockup of
 * 2026-10-23. **It reads `/api/deals`, which reads what the nightly scan
 * recorded; nothing here calls Kroger.**
 *
 * - **On my list** at the top: the rows that match an open line on the
 *   shopping list (`lib/listDeals.ts`), from the board and the list already
 *   read; no request of its own;
 * - search, the aisle chips (Kroger's own categories), **All · On sale ·
 *   Coupon · Stacks**, and **Any · Green · Neutral · Red · New**;
 * - each row: the name, its usual price, the sale and coupon tags, today's
 *   price, the stoplight's reason and an 8-week trend (the last bar is today);
 * - a product with under four weeks of history reads "new: building history",
 *   with no colour;
 * - Coupon and Stacks say "no coupons staged yet" until the Chrome task
 *   (TEC-126) has staged one.
 *
 * Local patterns, named so they are a decision deferred rather than drift: the
 * aisle chips, the colour filter, the deal rows with their stoplight mark and
 * trend bars. They reuse the theme's tokens only; **green is the livery's
 * accent and red is its danger**, and every colour also says what it means in
 * words, so none is colour alone.
 */

const KINDS: [Kind, string][] = [
  ["all", "All"],
  ["sale", "On sale"],
  ["coupon", "Coupon"],
  ["stack", "Stacks"],
];

const LIGHTS: [LightFilter, string][] = [
  ["any", "Any"],
  ["green", "Green"],
  ["neutral", "Neutral"],
  ["red", "Red"],
  ["new", "New"],
];

const money = (n: number) => `$${n.toFixed(2)}`;

function day(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Trend({ row }: { row: DealRow }) {
  const values = [...row.trend, row.now];
  const max = Math.max(...values);
  const today = row.light === "green" ? "bg-accent" : row.light === "red" ? "bg-danger" : "bg-ink-soft";
  return (
    <div
      className="flex h-[18px] items-end gap-0.5"
      role="img"
      aria-label={row.trend.length === 0 ? "No weekly history yet" : `Weekly means, ${row.trend.map(money).join(", ")}, then today ${money(row.now)}`}
    >
      {values.map((v, i) => (
        <span
          key={i}
          style={{ height: `${Math.max(4, Math.round((v / max) * 18))}px` }}
          className={`block w-[5px] rounded-sm ${i === values.length - 1 ? today : "bg-line"}`}
        />
      ))}
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "sale" | "coupon" | "stack" | "out" }) {
  const tones = {
    sale: "bg-accent text-accent-ink",
    coupon: "bg-raised text-ink",
    stack: "border border-accent text-accent",
    out: "border border-line text-ink-soft",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function Mark({ row }: { row: DealRow }) {
  if (row.light === "new") return <div className="text-xs italic text-ink-soft">{row.note}</div>;
  if (row.light === "green") return <div className="text-xs font-semibold text-accent">● Green · {row.note}</div>;
  if (row.light === "red") return <div className="text-xs font-semibold text-danger">● Red · {row.note}</div>;
  return <div className="text-xs text-ink-soft">{row.note}</div>;
}

function Row({ row, forLines }: { row: DealRow; forLines?: string[] }) {
  const edge = row.light === "green" ? "border-l-4 border-l-accent" : row.light === "red" ? "border-l-4 border-l-danger" : "";
  return (
    <li className={`flex items-center gap-3 border-t border-line/40 px-3.5 py-3 first:border-t-0 ${edge}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={row.url} target="_blank" rel="noreferrer" className="text-[15px] font-semibold underline decoration-dotted underline-offset-2">
            {row.name}
          </a>
          {row.bought > 1 ? <span className="text-[11px] font-semibold text-accent">★ bought {row.bought}×</span> : null}
        </div>
        <div className="text-xs text-ink-soft">
          {forLines ? `for ${forLines.join(", ")} · ` : ""}
          {row.size ? `${row.size} · ` : ""}usually {money(row.usual)}
          {row.priceDate ? ` · ${row.source === "scan" ? "last scan" : "as of"} ${day(row.priceDate)}` : ""}
        </div>
        <div className="flex flex-wrap gap-1">
          {row.onSale ? <Tag tone="sale">Sale{row.percentOff ? ` −${row.percentOff}%` : ""}</Tag> : null}
          {row.coupons.map((c) => (
            <Tag key={`${c.title}|${c.amount}`} tone="coupon">
              Coupon · {c.amount}
              {c.expires_on ? ` · to ${day(c.expires_on)}` : ""}
            </Tag>
          ))}
          {row.stacks ? <Tag tone="stack">Stacks</Tag> : null}
          {row.inStock === false ? <Tag tone="out">Out of stock</Tag> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="text-[17px] font-bold">{money(row.now)}</div>
        <Mark row={row} />
        <Trend row={row} />
      </div>
    </li>
  );
}

export default function DealsTab({ refreshKey = 0, openLines = null }: { refreshKey?: number; openLines?: string[] | null }) {
  const [board, setBoard] = useState<DealBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DealFilter>(NO_FILTER);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/deals", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the deals.");
      setBoard(body as DealBoard);
      setError(null);
    } catch (e) {
      // A failed read leaves the board null, never empty: "no deals" would be
      // a lie that reads as a quiet week.
      setError(e instanceof Error ? e.message : "Couldn't read the deals.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const aisles = useMemo(() => [ALL_AISLES, ...Array.from(new Set((board?.rows ?? []).map((r) => r.aisle))).sort()], [board]);
  const shown = useMemo(() => (board?.rows ?? []).filter((r) => matchesFilter(r, filter)), [board, filter]);
  const groups = useMemo(() => groupByAisle(shown), [shown]);
  const mine = useMemo(() => (board && openLines ? listDeals(board.rows, openLines) : []), [board, openLines]);
  const set = (patch: Partial<DealFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const wantsCoupons = filter.kind === "coupon" || filter.kind === "stack";

  function empty(): string {
    if (!board) return "";
    if (!board.store) return "Pick a store on the King Soopers list first, so prices are from your King Soopers.";
    if (wantsCoupons && !board.couponsStaged) return "No coupons staged yet.";
    if (board.rows.length === 0) {
      return board.hasNights
        ? "None of your saved products has a recent price."
        : "No prices yet. The nightly scan runs about 3 a.m. Denver time; the first one fills this in.";
    }
    return "No deals match. Clear the search, or pick All aisles.";
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-2">
        <h2 className="text-xl font-bold">Deals</h2>
        <p className="text-[13px] text-ink-soft">
          {board
            ? board.store
              ? `${board.store} · ${board.rows.length} saved product${board.rows.length === 1 ? "" : "s"} priced · each against its own last 12 weeks`
              : "No store picked"
            : error
              ? ""
              : "Looking…"}
        </p>
      </div>

      {error ? (
        <p role="alert" className="px-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <input
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="cheerios, yogurt, coffee…"
          aria-label="Search deals"
          className="min-h-11 rounded-xl border border-line bg-surface px-3.5 text-base"
        />
        <div role="group" aria-label="Show" className="grid grid-cols-4 gap-1 rounded-xl bg-raised p-1">
          {KINDS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter.kind === id}
              onClick={() => set({ kind: id })}
              className={`min-h-11 rounded-[9px] text-[13px] ${filter.kind === id ? "bg-surface font-bold text-ink" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Colour" className="grid grid-cols-5 gap-1 rounded-xl bg-raised p-1">
          {LIGHTS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter.light === id}
              onClick={() => set({ light: id })}
              className={`min-h-11 rounded-[9px] text-[13px] ${filter.light === id ? "bg-surface font-bold text-ink" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Aisle" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {aisles.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={filter.aisle === a}
              onClick={() => set({ aisle: a })}
              className={`flex min-h-10 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] ${
                filter.aisle === a ? "bg-accent font-semibold text-accent-ink" : "border border-line bg-surface"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {board?.store ? (
        <div className="flex flex-col gap-1.5" aria-label="On my list">
          <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
            On my list{mine.length > 0 ? ` · ${mine.length}` : ""}
          </h3>
          {mine.length > 0 ? (
            <ul className="overflow-hidden rounded-xl bg-surface">
              {mine.map((d) => (
                <Row key={d.row.productId} row={d.row} forLines={d.lines} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-surface p-4 text-sm text-ink-soft">
              {openLines === null ? "Reading your list…" : "Nothing on your list has a deal right now."}
            </p>
          )}
        </div>
      ) : null}

      {board && groups.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm text-ink-soft">{empty()}</p> : null}

      {groups.map((g) => (
        <div key={g.aisle} className="flex flex-col gap-1.5">
          <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
            {g.aisle} · {g.rows.length}
          </h3>
          <ul className="overflow-hidden rounded-xl bg-surface">
            {g.rows.map((r) => (
              <Row key={r.productId} row={r} />
            ))}
          </ul>
        </div>
      ))}

      {board && board.unpriced > 0 ? (
        <p className="px-2 text-[11px] text-ink-soft">
          {board.unpriced} saved product{board.unpriced === 1 ? "" : "s"} had no price in the last few nights, so {board.unpriced === 1 ? "it isn't" : "they aren't"} shown.
        </p>
      ) : null}

      <p className="px-2 text-[11px] text-ink-soft">
        Prices are Kroger&rsquo;s at your store, recorded every night about 3 a.m. Denver time; a missed night is a gap, never filled in.
        Green is 15% or more under a product&rsquo;s usual price, or at its 12-week low and under its usual; red is 10% or more over, even on sale.
        Coupons come only from your own Chrome task, once it has run.
      </p>
    </section>
  );
}
