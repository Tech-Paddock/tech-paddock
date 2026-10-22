"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SavedProduct } from "@/lib/brands";
import type { Preference } from "@/lib/preferences";
import type { PreviewEntry } from "@/lib/brandBatch";
import { isKingSoopersProduct } from "@/lib/kingsoopers";
import { describeDrift, sizeDrift } from "@/lib/sizeDrift";

/**
 * Your brands — its own tab since TEC-131, at `/brands`.
 *
 * **One row per King Soopers product code.** Each holds its names (every way a
 * list line may refer to it, matched as whole words), a count, the size first
 * bought beside the size Kroger reports now, and what the last refresh saw.
 * Search words stay their own kind: a phrase and the words to search.
 *
 * **Why remembering cannot read the product you picked.** A line's link opens
 * King Soopers in a new tab, cross-origin, and this project's proxy refuses
 * kingsoopers.com server-side, so nothing here can see where you ended up. Copy
 * the product page's address there, then **Paste** here.
 *
 * Local patterns, named so they are a decision deferred rather than drift: the
 * product rows with their drift and successor lines, the batch review's status
 * chips, and the filter box. They reuse the theme's tokens only.
 */

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function money(n: number | null): string | null {
  return n === null ? null : `$${n.toFixed(2)}`;
}

/** The editor for one product: its names as one comma-separated field, and its page or code. */
function ProductForm({ existing, onSaved, onCancel }: { existing: SavedProduct | null; onSaved: () => void; onCancel: () => void }) {
  const [names, setNames] = useState(existing?.names.join(", ") ?? "");
  const [product, setProduct] = useState(existing ? (existing.url ?? existing.product_id) : "");
  const [sizeFirst, setSizeFirst] = useState(existing?.size_first ?? "");
  const [packLabel, setPackLabel] = useState(existing?.pack_label ?? "");
  const [packSize, setPackSize] = useState(existing?.pack_size ? String(existing.pack_size) : "");
  const [packUnit, setPackUnit] = useState(existing?.pack_unit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function paste() {
    setError(null);
    try {
      const copied = (await navigator.clipboard.readText()).trim();
      if (!isKingSoopersProduct(copied) && !/^\d{8,14}$/.test(copied)) {
        setError("That isn't a King Soopers product page or a product code. Copy the address from the product's own page.");
        return;
      }
      setProduct(copied);
    } catch {
      setError("Couldn't read the clipboard. Paste the address into the box instead.");
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // **No count, brand or note in this body, on purpose**: a field left
      // out keeps the row's value, so editing names never wipes a batch's note.
      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(existing ? { id: existing.id } : {}),
          names,
          product,
          ...(existing || sizeFirst.trim() ? { size_first: sizeFirst } : {}),
          // The pack conversion (TEC-131): blank clears it.
          pack_label: packLabel,
          pack_size: packSize.trim() ? Number(packSize) : null,
          pack_unit: packSize.trim() ? packUnit : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save that.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        Names — every way a list line may say it, separated by commas
        <input
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder="coke zero, coke, 12 pack coke zero"
          className="rounded-lg border border-line bg-surface p-2 text-base text-ink"
        />
      </label>
      <div className="flex gap-2">
        <input
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="https://www.kingsoopers.com/p/… or the product code"
          aria-label="The product page or code"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-2 text-base"
        />
        <button type="button" onClick={paste} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs">
          Paste
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        Size first bought
        <input
          value={sizeFirst}
          onChange={(e) => setSizeFirst(e.target.value)}
          placeholder="12 oz — filled by the next refresh if blank"
          className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-ink-soft">
        <span>Pack conversion — optional. The list shows the shopping unit and rounds the cart quantity up.</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={packLabel}
            onChange={(e) => setPackLabel(e.target.value)}
            placeholder="Heads of Garlic"
            aria-label="Shopping unit"
            className="w-36 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
          <span>1 holds</span>
          <input
            value={packSize}
            onChange={(e) => setPackSize(e.target.value)}
            inputMode="decimal"
            placeholder="10"
            aria-label="How many recipe units one holds"
            className="w-14 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
          <input
            value={packUnit}
            onChange={(e) => setPackUnit(e.target.value)}
            placeholder="cloves"
            aria-label="The recipe unit"
            className="w-24 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || names.trim() === "" || product.trim() === "" || (packSize.trim() !== "" && packUnit.trim() === "")}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The editor for search words: a phrase, and what to search instead. */
function WordsForm({ existing, onSaved, onCancel }: { existing: Preference | null; onSaved: () => void; onCancel: () => void }) {
  const [phrase, setPhrase] = useState(existing?.phrase ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "terms", phrase, terms }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save that.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
      <input
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="milk"
        aria-label="The phrase"
        className="rounded-lg border border-line bg-surface p-2 text-base"
      />
      <input
        value={terms}
        onChange={(e) => setTerms(e.target.value)}
        placeholder="fairlife 2% ultra filtered"
        aria-label="The words to search"
        className="rounded-lg border border-line bg-surface p-2 text-base"
      />
      <p className="text-[11px] text-ink-soft">What you would type in the shop&rsquo;s search box.</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || phrase.trim() === "" || terms.trim() === ""}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One product: names, count, what Kroger last said, drift, and the successor on offer. */
function ProductRow(props: { p: SavedProduct; onEdit: () => void; onForget: () => void; onReplace: () => void; replacing: boolean }) {
  const { p } = props;
  const drift = sizeDrift(p.size_first, p.size, p.price);
  const seen = [
    p.description,
    p.size,
    money(p.price),
    p.in_stock === false ? "out of stock" : p.in_stock ? "in stock" : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <b>{p.names.join(", ")}</b>
          <span className="text-ink-soft"> · ×{p.count}</span>
        </span>
        <button type="button" onClick={props.onEdit} className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2">
          edit
        </button>
        <button type="button" onClick={props.onForget} className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2">
          forget
        </button>
      </div>
      <span className="text-[11px] text-ink-soft">
        {p.url ? (
          <a href={p.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
            {p.product_id}
          </a>
        ) : (
          p.product_id
        )}
        {seen.length > 0 ? ` · ${seen.join(" · ")}` : ""}
        {p.checked_at ? ` — checked ${day(p.checked_at)}` : " — not checked yet"}
        {p.size_first && !drift ? ` · first bought ${p.size_first}` : ""}
      </span>
      {p.pack_label || p.pack_size ? (
        <span className="text-[11px] text-ink-soft">
          Shown as {p.pack_label ?? p.names[0]}
          {p.pack_size ? ` · 1 holds ${p.pack_size} ${p.pack_unit}` : ""}
        </span>
      ) : null}
      {drift ? <span className="text-xs text-warn">Size changed: {describeDrift(drift)}</span> : null}
      {p.missing_since ? (
        <span className="text-xs text-danger">
          Kroger no longer returns this product (since {day(p.missing_since)}).
          {p.successor ? (
            <>
              {" "}
              Closest now:{" "}
              <a href={p.successor.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                {p.successor.description}
              </a>
              {p.successor.size ? ` · ${p.successor.size}` : ""}
              {p.successor.price !== null ? ` · $${p.successor.price.toFixed(2)}` : ""}{" "}
              <button
                type="button"
                onClick={props.onReplace}
                disabled={props.replacing}
                className="ml-1 rounded border border-danger/60 px-2 py-0.5 text-[11px] disabled:opacity-50"
              >
                {props.replacing ? "Replacing…" : "Replace with it"}
              </button>{" "}
              <span className="text-ink-soft">Keeps the names and count.</span>
            </>
          ) : (
            " Edit it with a new product page, or forget it."
          )}
        </span>
      ) : null}
    </li>
  );
}

const STATUS_WORDS: Record<PreviewEntry["status"], string> = {
  new: "new",
  updates: "updates what is saved",
  already: "already in Your brands",
  replaces: "replaces what is saved",
  refused: "refused",
};

/**
 * Paste a batch's review: **every row, with a tick, before anything is
 * written.** New rows start ticked; a row that would change a saved one starts
 * unticked and says what is there now. Refused rows show why and cannot be ticked.
 */
function BatchReview(props: {
  entries: PreviewEntry[];
  ticked: Set<number>;
  toggle: (i: number) => void;
  writing: boolean;
  onWrite: () => void;
  onCancel: () => void;
}) {
  const { entries, ticked } = props;
  const writable = entries.filter((e) => e.send).length;
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-accent p-2">
      <p className="text-xs text-ink-soft">
        {entries.length} row{entries.length === 1 ? "" : "s"} · {writable} can be written · nothing is saved until you tap Write.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {entries.map((e, i) => {
          const on = ticked.has(i);
          return (
            <li key={i} className="flex items-baseline gap-2 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={on}
                disabled={!e.send}
                onChange={() => props.toggle(i)}
                aria-label={`Write ${e.label}`}
                className="size-4 shrink-0 accent-accent disabled:opacity-40"
              />
              <span className="min-w-0 flex-1">
                <b>{e.kind === "product" && e.names ? e.names.join(", ") : e.label}</b>
                {e.status !== "refused" ? (
                  e.kind === "product" ? (
                    <span className="text-ink-soft">
                      {" "}
                      → {e.productId}
                      {e.count !== null && e.count !== undefined ? ` · count ${e.count}` : ""}
                      {e.sizeFirst ? ` · first bought ${e.sizeFirst}` : ""}
                    </span>
                  ) : (
                    <span className="text-ink-soft"> → &ldquo;{e.terms}&rdquo;</span>
                  )
                ) : null}
                <span
                  className={`ml-1 rounded border px-1 text-[11px] ${
                    e.status === "refused" ? "border-danger/60 text-danger" : e.status === "new" ? "border-accent text-accent" : "border-warn/60 text-warn"
                  }`}
                >
                  {STATUS_WORDS[e.status]}
                </span>
                {e.existing ? (
                  <span className="block text-[11px] text-ink-soft">
                    Saved now:{" "}
                    {e.kind === "product"
                      ? `${(e.existing.names ?? []).join(", ")} · count ${e.existing.count ?? 0}${e.existing.sizeFirst ? ` · first bought ${e.existing.sizeFirst}` : ""}`
                      : e.existing.terms
                        ? `“${e.existing.terms}”`
                        : "searched plainly"}
                    {e.changes?.length ? ` — ticking it: ${e.changes.join("; ")}.` : ""}
                    {e.send ? (on ? " Ticked, so it will be written." : " Left as it is unless ticked.") : ""}
                  </span>
                ) : null}
                {e.reason ? <span className="block text-[11px] text-danger">{e.reason}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={props.onCancel} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft">
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onWrite}
          disabled={props.writing || ticked.size === 0}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          {props.writing ? "Writing…" : `Write ${ticked.size} ticked`}
        </button>
      </div>
    </div>
  );
}

export default function Brands({ onChanged, refreshKey = 0 }: { onChanged: () => void; refreshKey?: number }) {
  const [products, setProducts] = useState<SavedProduct[] | null>(null);
  const [words, setWords] = useState<Preference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<{ kind: "product"; row: SavedProduct | null } | { kind: "words"; row: Preference | null } | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/brands", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read your brands.");
      setProducts(body.products as SavedProduct[]);
      setWords(body.words as Preference[]);
      setError(null);
    } catch (e) {
      // A failed read stays null, never [], because "you have no brands" would
      // be a lie that reads as a fresh start.
      setError(e instanceof Error ? e.message : "Couldn't read your brands.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const sorted = useMemo(
    () => [...(products ?? [])].sort((a, b) => (a.names[0] ?? "").toLowerCase().localeCompare((b.names[0] ?? "").toLowerCase())),
    [products]
  );
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => [...p.names, p.description ?? "", p.product_id].some((t) => t.toLowerCase().includes(q)));
  }, [sorted, filter]);
  const flagged = sorted.filter((p) => p.missing_since).length;
  const drifted = sorted.filter((p) => sizeDrift(p.size_first, p.size, p.price)).length;

  async function changed() {
    await load();
    onChanged();
  }

  async function forget(id: string, kind: "product" | "terms") {
    const response = await fetch("/api/brands", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind }),
    });
    if (!response.ok) {
      setError((await response.json()).error ?? "Couldn't forget that one.");
      return;
    }
    await changed();
  }

  async function replace(id: string) {
    if (replacing) return;
    setReplacing(id);
    try {
      const response = await fetch("/api/brands/successor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't replace it.");
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't replace it.");
    } finally {
      setReplacing(null);
    }
  }

  /** Step one: the review. **Nothing is written here.** */
  async function reviewRows() {
    setOutcome(null);
    setPreview(null);
    let rows: unknown;
    try {
      rows = JSON.parse(paste);
    } catch {
      setOutcome("That is not valid JSON.");
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      setOutcome("Expected a JSON array of rows.");
      return;
    }
    try {
      const response = await fetch("/api/brands/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't review that batch.");
      const entries = body.entries as PreviewEntry[];
      setPreview(entries);
      setTicked(new Set(entries.flatMap((e, i) => (e.status === "new" && e.send ? [i] : []))));
    } catch (e) {
      setOutcome(e instanceof Error ? e.message : "Couldn't review that batch.");
    }
  }

  /** Step two: write exactly the ticked rows. */
  async function writeTicked() {
    if (!preview || writing) return;
    const rows = preview.flatMap((e, i) => (ticked.has(i) && e.send ? [e.send] : []));
    if (rows.length === 0) return;
    setWriting(true);
    try {
      const response = await fetch("/api/brands/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't write those.");
      // Every refusal is named: a count with no reasons is how a seed of four
      // hundred quietly lands as three hundred and ninety.
      const refused = (body.rejected as { row: number; reason: string }[]) ?? [];
      const left = preview.length - rows.length;
      setOutcome(
        `Saved ${body.saved}.` +
          (left > 0 ? ` Left out ${left}.` : "") +
          (refused.length ? ` Refused ${refused.length}: ${refused.map((r) => r.reason).join("; ")}` : "")
      );
      setPreview(null);
      setPaste("");
      await changed();
    } catch (e) {
      setOutcome(e instanceof Error ? e.message : "Couldn't write those.");
    } finally {
      setWriting(false);
    }
  }

  const form =
    editing?.kind === "product" ? (
      <ProductForm
        // Keyed by the row, or the form keeps the last row's values (TEC-29 item 1).
        key={editing.row?.id ?? "new-product"}
        existing={editing.row}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void changed();
        }}
      />
    ) : editing?.kind === "words" ? (
      <WordsForm
        key={editing.row?.id ?? "new-words"}
        existing={editing.row}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void changed();
        }}
      />
    ) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Your brands</h2>
        <p className="text-xs text-ink-soft">
          One row per King Soopers product, with every name a list line may use for it. Send to cart puts a line that matches one
          product straight in, and asks when it matches several.
        </p>
        {products ? (
          <p className="text-xs text-ink-soft">
            {products.length} product{products.length === 1 ? "" : "s"} · {words.length} search-word phrase{words.length === 1 ? "" : "s"}
            {drifted > 0 ? <span className="text-warn"> · {drifted} changed size</span> : null}
            {flagged > 0 ? <span className="text-danger"> · {flagged} Kroger no longer returns</span> : null}
          </p>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing({ kind: "product", row: null })} className="rounded-lg border border-line px-3 py-1.5 text-xs">
          Remember a product
        </button>
        <button type="button" onClick={() => setEditing({ kind: "words", row: null })} className="rounded-lg border border-line px-3 py-1.5 text-xs">
          Add search words
        </button>
        {/* **Export**: the batch format, so the file pastes back in. */}
        <a href="/api/brands/export" download className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft">
          Export
        </a>
      </div>

      {editing && !editing.row ? form : null}

      {products === null && !error ? <p className="text-xs text-ink-soft">Looking…</p> : null}

      {products && products.length === 0 && words.length === 0 ? (
        <p className="text-xs text-ink-soft">
          Nothing yet. Paste a batch below, or <b>Remember a product</b>; Send to cart remembers what goes in, too.
        </p>
      ) : null}

      {products && products.length > 0 ? (
        <div className="flex flex-col gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, Kroger's name or code"
            aria-label="Filter your brands"
            className="rounded-lg border border-line bg-surface p-2 text-base"
          />
          <ul className="flex flex-col divide-y divide-line">
            {shown.map((p) =>
              editing?.kind === "product" && editing.row?.id === p.id ? (
                <li key={p.id} className="py-2">
                  {form}
                </li>
              ) : (
                <ProductRow
                  key={p.id}
                  p={p}
                  onEdit={() => setEditing({ kind: "product", row: p })}
                  onForget={() => void forget(p.id, "product")}
                  onReplace={() => void replace(p.id)}
                  replacing={replacing === p.id}
                />
              )
            )}
          </ul>
          {shown.length === 0 ? <p className="text-xs text-ink-soft">Nothing matches that filter.</p> : null}
        </div>
      ) : null}

      {words.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-ink-soft">Search words</h3>
          <ul className="flex flex-col divide-y divide-line">
            {words.map((w) =>
              editing?.kind === "words" && editing.row?.id === w.id ? (
                <li key={w.id} className="py-2">
                  {form}
                </li>
              ) : (
                <li key={w.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{w.phrase}</b>
                    <span className="text-ink-soft">{w.kind === "plain" ? " — searched plainly, on purpose" : ` — “${w.terms}”`}</span>
                  </span>
                  {w.kind === "terms" ? (
                    <button
                      type="button"
                      onClick={() => setEditing({ kind: "words", row: w })}
                      className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2"
                    >
                      edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void forget(w.id, "terms")}
                    className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2"
                  >
                    forget
                  </button>
                </li>
              )
            )}
          </ul>
        </div>
      ) : null}

      {/* The purchase-history path. The aggregation happens in a session that
          has the history; this only ever sees the rows it produced, and the
          history itself never reaches this app or the repo. Format: NOTES.md. */}
      <details>
        <summary className="cursor-pointer text-xs text-ink-soft">Paste a batch</summary>
        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setPreview(null);
          }}
          rows={4}
          placeholder={'[{"product":"0001111000001","names":["oat milk"],"count":3}]'}
          aria-label="A batch of products as JSON"
          className="mt-2 w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs"
        />
        {preview ? (
          <BatchReview
            entries={preview}
            ticked={ticked}
            toggle={(i) =>
              setTicked((current) => {
                const next = new Set(current);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              })
            }
            writing={writing}
            onWrite={() => void writeTicked()}
            onCancel={() => setPreview(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => void reviewRows()}
            disabled={paste.trim() === ""}
            className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft disabled:opacity-50"
          >
            Review
          </button>
        )}
        {outcome ? <p className="mt-2 text-xs text-ink-soft">{outcome}</p> : null}
      </details>
    </section>
  );
}
