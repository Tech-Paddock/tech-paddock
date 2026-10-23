"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SavedProduct } from "@/lib/brands";
import type { Preference } from "@/lib/preferences";
import type { PreviewEntry } from "@/lib/brandBatch";
import { isKingSoopersProduct } from "@/lib/kingsoopers";
import { describeDrift, sizeDrift } from "@/lib/sizeDrift";
import { brandGroups, defaultNames, fixThese, shortName, type BrandGroup, type GroupMember } from "@/lib/brandGroups";
import { serialKroger } from "./Cart";

/**
 * Your brands — its own tab since TEC-131, at `/brands`.
 *
 * **One row per King Soopers product code.** Each holds its names (every way a
 * list line may refer to it, matched as whole words), a count, the size first
 * bought beside the size Kroger reports now, and what the last refresh saw.
 * Search words stay their own kind: a phrase and the words to search.
 *
 * **As the owner's mockup of 2026-10-23 (TEC-135)**: products grouped by the
 * names they share, the default starred, **Make default** on the others and
 * *when the line says "…"* under each; **Fix these** above them (a size that
 * shrank, a product Kroger no longer returns with **Replace**, and rows whose
 * note starts `check:`); the filters **All · Pick a default · Fix these**.
 * The grouping is `lib/brandGroups.ts`.
 *
 * **Why remembering cannot read the product you picked.** A line's link opens
 * King Soopers in a new tab, cross-origin, and this project's proxy refuses
 * kingsoopers.com server-side, so nothing here can see where you ended up. Copy
 * the product page's address there, then **Paste** here.
 *
 * Local patterns, named so they are a decision deferred rather than drift: the
 * group cards and their product rows, the Fix these panel, the three-way
 * filter, the batch review's status chips and the search box. They reuse the
 * theme's tokens only.
 */

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


/** "bought N×" — the times-bought count, never a quantity (TEC-135). */
function bought(count: number): string {
  return `bought ${count}×`;
}

/** "checked 2 days ago", from the most recent check of any product. */
function checkedAgo(products: SavedProduct[]): string {
  const latest = products.reduce<string | null>((best, p) => (p.checked_at && (!best || p.checked_at > best) ? p.checked_at : best), null);
  if (!latest) return "not checked yet";
  const days = Math.floor((Date.now() - new Date(latest).getTime()) / 86_400_000);
  return days <= 0 ? "checked today" : days === 1 ? "checked yesterday" : `checked ${days} days ago`;
}

const LINK = "text-[13px] text-accent underline-offset-2 hover:underline disabled:opacity-50";

/** One product in its group: ★ when it is the default, what it is, and Make default on the others. */
function MemberRow(props: {
  member: GroupMember;
  multi: boolean;
  onMakeDefault: () => void;
  making: boolean;
  onEdit: () => void;
  onForget: () => void;
}) {
  const { product: p, isDefault, hint } = props.member;
  const drift = sizeDrift(p.size_first, p.size, p.price);
  const detail = [
    [p.size ?? p.size_first, money(p.price)].filter(Boolean).join(" · ") || null,
    bought(p.count),
    props.multi ? (isDefault ? "default" : hint ? `when the line says “${hint}”` : null) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={`flex items-center gap-2.5 border-t border-line/40 px-3.5 py-2.5 ${isDefault && props.multi ? "bg-accent/10" : ""}`}>
      <span aria-hidden="true" className={`text-[15px] ${isDefault ? "text-accent" : "text-line/60"}`}>
        ★
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">
          {p.url ? (
            <a href={p.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {shortName(p)}
            </a>
          ) : (
            shortName(p)
          )}
        </span>
        <span className="text-xs text-ink-soft">{detail}</span>
        {drift ? <span className="text-xs text-warn">Size changed: {describeDrift(drift)}</span> : null}
        <span className="flex gap-3 text-[11px] text-ink-soft">
          <span>{p.product_id}</span>
          <button type="button" onClick={props.onEdit} className="underline decoration-dotted underline-offset-2">
            edit
          </button>
          <button type="button" onClick={props.onForget} className="underline decoration-dotted underline-offset-2">
            forget
          </button>
        </span>
      </span>
      {props.multi && !isDefault ? (
        <button
          type="button"
          onClick={props.onMakeDefault}
          disabled={props.making}
          className="min-h-9 shrink-0 rounded-full border border-accent px-3 text-xs font-semibold text-accent disabled:opacity-50"
        >
          {props.making ? "Saving…" : "Make default"}
        </button>
      ) : null}
    </li>
  );
}

type View = "all" | "pick" | "fix";

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
  const [view, setView] = useState<View>("all");
  const [panel, setPanel] = useState<null | "batch" | "words">(null);
  const [editing, setEditing] = useState<{ kind: "product"; row: SavedProduct | null } | { kind: "words"; row: Preference | null } | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ text: string; failed: boolean } | null>(null);
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

  const groups = useMemo(() => brandGroups(products ?? []), [products]);
  const fixes = useMemo(() => fixThese(products ?? []), [products]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = (g: BrandGroup) =>
      !q ||
      g.title.toLowerCase().includes(q) ||
      g.members.some(({ product: p }) => [...p.names, p.description ?? "", p.product_id].some((t) => t.toLowerCase().includes(q)));
    return groups.filter((g) => (view === "pick" ? g.needsDefault : true) && matches(g));
  }, [groups, filter, view]);
  const shownFixes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return fixes.filter((f) => !q || f.title.toLowerCase().includes(q) || f.product.names.some((n) => n.toLowerCase().includes(q)));
  }, [fixes, filter]);

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

  /** **Make default** (TEC-135): this product, for every name its group shares that it carries. */
  async function makeDefault(group: BrandGroup, p: SavedProduct) {
    if (making) return;
    setMaking(p.id);
    try {
      const response = await fetch("/api/brands/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, names: defaultNames(group, p) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't make it the default.");
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make it the default.");
    } finally {
      setMaking(null);
    }
  }

  /** Refresh now: the same refresh as the list's, in the page's one Kroger queue. Said in words either way. */
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await serialKroger(() => fetch("/api/kroger/refresh", { method: "POST" }));
      const body = await response.json().catch(() => ({}));
      setRefreshNote(
        response.ok
          ? { text: body.message as string, failed: false }
          : { text: `Refresh failed: ${body.error ?? "Kroger or the database didn't answer."}`, failed: true }
      );
      await changed();
    } catch {
      setRefreshNote({ text: "Refresh failed: couldn't reach this app's server.", failed: true });
    } finally {
      setRefreshing(false);
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

  const views: [View, string][] = [
    ["all", "All"],
    ["pick", "Pick a default"],
    ["fix", `Fix these · ${fixes.length}`],
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 px-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">Your brands</h2>
          <p className="text-[13px] text-ink-soft">
            {products ? `${products.length} product${products.length === 1 ? "" : "s"} · ${checkedAgo(products)}` : "Looking…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="min-h-10 shrink-0 rounded-[10px] border border-accent px-3.5 text-[13px] font-semibold text-accent disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>
      {refreshNote ? (
        <p role={refreshNote.failed ? "alert" : undefined} className={`px-2 text-xs ${refreshNote.failed ? "text-danger" : "text-ink-soft"}`}>
          {refreshNote.text}
        </p>
      ) : null}

      {error ? <p role="alert" className="px-2 text-xs text-danger">{error}</p> : null}

      <div className="flex flex-col gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search names or products"
          aria-label="Search Your brands"
          className="min-h-11 rounded-xl border border-line bg-surface px-3.5 text-base"
        />
        <div role="group" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
          {views.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`min-h-11 rounded-[9px] text-[13px] ${view === id ? "bg-surface font-bold text-ink" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {editing?.kind === "product" && (!editing.row || view === "fix") ? form : null}

      {products && products.length === 0 && words.length === 0 ? (
        <p className="px-2 text-xs text-ink-soft">
          Nothing yet. Paste a batch below, or <b>Remember a product</b>; Send to cart remembers what goes in, too.
        </p>
      ) : null}

      {/* **Fix these** (TEC-135): shrank, discontinued, or seeded wrong (a note starting "check:"). */}
      {view !== "pick" && shownFixes.length > 0 ? (
        <div className="overflow-hidden rounded-xl border-2 border-warn bg-surface">
          <h3 className="px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-warn">
            Fix these · {fixes.length} · shrank, discontinued or seeded wrong
          </h3>
          <ul>
            {shownFixes.map((f) => (
              <li key={`${f.kind}:${f.product.id}`} className="flex items-center gap-2.5 border-t border-line/40 px-3.5 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{f.title}</span>
                  <span className="text-xs text-ink-soft">{f.detail}</span>
                </span>
                {f.kind === "gone" && f.product.successor ? (
                  <button
                    type="button"
                    onClick={() => void replace(f.product.id)}
                    disabled={replacing === f.product.id}
                    title="Keeps the names and count."
                    className="min-h-9 shrink-0 rounded-full bg-accent px-3 text-xs font-semibold text-accent-ink disabled:opacity-50"
                  >
                    {replacing === f.product.id ? "Replacing…" : "Replace"}
                  </button>
                ) : f.kind === "check" || f.kind === "gone" ? (
                  <button type="button" onClick={() => setEditing({ kind: "product", row: f.product })} className={LINK}>
                    edit
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view === "fix" && shownFixes.length === 0 && products ? <p className="px-2 text-xs text-ink-soft">Nothing to fix.</p> : null}

      {view !== "fix"
        ? shown.map((g) => (
            <div key={g.key} className="overflow-hidden rounded-xl bg-surface">
              <div className="flex items-baseline justify-between gap-3 px-3.5 py-3">
                <h3 className="text-[15px] font-bold">{g.title.charAt(0).toUpperCase() + g.title.slice(1)}</h3>
                <span className="truncate text-xs text-ink-soft">{groupNames(g)}</span>
              </div>
              <ul>
                {g.members.map((m) =>
                  editing?.kind === "product" && editing.row?.id === m.product.id ? (
                    <li key={m.product.id} className="border-t border-line/40 p-2">
                      {form}
                    </li>
                  ) : (
                    <MemberRow
                      key={m.product.id}
                      member={m}
                      multi={g.members.length > 1}
                      making={making === m.product.id}
                      onMakeDefault={() => void makeDefault(g, m.product)}
                      onEdit={() => setEditing({ kind: "product", row: m.product })}
                      onForget={() => void forget(m.product.id, "product")}
                    />
                  )
                )}
              </ul>
            </div>
          ))
        : null}
      {view !== "fix" && products && products.length > 0 && shown.length === 0 ? (
        <p className="px-2 text-xs text-ink-soft">{view === "pick" ? "Every name with several products has a default." : "Nothing matches that search."}</p>
      ) : null}

      <div className="flex flex-wrap gap-4 px-2">
        <button type="button" onClick={() => setEditing({ kind: "product", row: null })} className={LINK}>
          Remember a product
        </button>
        <button type="button" onClick={() => setPanel(panel === "batch" ? null : "batch")} className={LINK}>
          Paste a batch
        </button>
        {/* **Export**: the batch format, so the file pastes back in. */}
        <a href="/api/brands/export" download className={LINK}>
          Export
        </a>
        <button type="button" onClick={() => setPanel(panel === "words" ? null : "words")} className={LINK}>
          Search words{words.length > 0 ? ` · ${words.length}` : ""}
        </button>
      </div>

      {panel === "words" ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Search words</h3>
          {words.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line/40">
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
                      <button type="button" onClick={() => setEditing({ kind: "words", row: w })} className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2">
                        edit
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void forget(w.id, "terms")} className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2">
                      forget
                    </button>
                  </li>
                )
              )}
            </ul>
          ) : (
            <p className="text-xs text-ink-soft">None yet: a phrase, and the words to search instead.</p>
          )}
          {editing?.kind === "words" && !editing.row ? (
            form
          ) : (
            <button type="button" onClick={() => setEditing({ kind: "words", row: null })} className={`self-start ${LINK}`}>
              Add search words
            </button>
          )}
        </div>
      ) : null}

      {/* The purchase-history path. The aggregation happens in a session that
          has the history; this only ever sees the rows it produced, and the
          history itself never reaches this app or the repo. Format: NOTES.md. */}
      {panel === "batch" ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Paste a batch</h3>
          <textarea
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setPreview(null);
            }}
            rows={4}
            placeholder={'[{"product":"0001111000001","names":["oat milk"],"count":3}]'}
            aria-label="A batch of products as JSON"
            className="w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs"
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
              className="self-start rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft disabled:opacity-50"
            >
              Review
            </button>
          )}
          {outcome ? <p className="text-xs text-ink-soft">{outcome}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** The names under a group's title: the names its products share, or a lone product's names and pack conversion. */
function groupNames(g: BrandGroup): string {
  if (g.members.length > 1) return g.shared.join(" · ");
  const p = g.members[0].product;
  const pack = p.pack_size ? `1 holds ${p.pack_size} ${p.pack_unit}` : null;
  return [...p.names, pack].filter(Boolean).join(" · ");
}
