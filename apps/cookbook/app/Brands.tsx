"use client";

import { useCallback, useEffect, useState } from "react";
import type { Preference, PreferenceKind } from "@/lib/preferences";
import type { PreviewEntry } from "@/lib/brandBatch";
import { isKingSoopersProduct } from "@/lib/kingsoopers";

/**
 * Your brands — the panel that lists them, and the one editor.
 *
 * **Remembering happens only here** (TEC-39, 2026-09-24). The list's lines
 * used to carry a *remember* link each; they are just the item and its link now,
 * and **Remember a brand** opens the editor empty. It lives at the bottom of the
 * King Soopers list tab, collapsed, rather than on a settings page: a preferences
 * route would be a second place to go and the only thing it would hold is this.
 *
 * **Why remembering cannot read the product you picked.** A line's link opens
 * King Soopers in a new tab, cross-origin, and this project's proxy refuses
 * kingsoopers.com server-side, so nothing here can see where you ended up. Copy
 * the product page's address there, then **Paste** here: that is the floor, and
 * a known one.
 */

const KINDS: { value: Exclude<PreferenceKind, "plain">; label: string; hint: string }[] = [
  { value: "product", label: "This exact product", hint: "Copy the product page's address at King Soopers, then Paste." },
  { value: "terms", label: "Better search words", hint: "What you would type in the shop's search box." },
];

export function RememberForm({
  existing,
  onSaved,
  onCancel,
}: {
  /** The row being edited, or null for a new one. The caller keys this form by it. */
  existing: Preference | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(existing?.phrase ?? "");
  // A row saved as `plain` before 2026-09-24 opens as terms: plain is no longer
  // something the editor can write.
  const [kind, setKind] = useState<Exclude<PreferenceKind, "plain">>(
    existing?.kind === "product" ? "product" : "terms"
  );
  const [url, setUrl] = useState(existing?.url ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function paste() {
    setError(null);
    try {
      const copied = (await navigator.clipboard.readText()).trim();
      if (!isKingSoopersProduct(copied)) {
        setError("That isn't a King Soopers product page. Copy the address from the product's own page.");
        return;
      }
      setUrl(copied);
    } catch {
      // Refused often enough — a declined prompt, or the hub framing this page —
      // that a silent failure would look like the button doing nothing.
      setError("Couldn't read the clipboard. Paste the address into the box instead.");
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // **No brand and no note in this body, on purpose.** A field left out is a
      // field the save leaves alone (`readDraft`), so editing a rule never wipes
      // the note a batch gave it. **The row's id when editing** (TEC-51): a
      // phrase can hold several products, so the phrase alone no longer says
      // which row this is.
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(existing ? { id: existing.id } : {}), phrase: text, kind, url, terms }),
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

  const chosen = KINDS.find((k) => k.value === kind);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        Item
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="milk"
          className="w-40 rounded border border-line bg-surface px-2 py-1 text-sm"
          aria-label="Item"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              kind === k.value ? "border-accent text-accent" : "border-line text-ink-soft"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-soft">{chosen?.hint}</p>

      {kind === "product" ? (
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.kingsoopers.com/p/…"
            aria-label="The product page"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-2 text-base"
          />
          <button
            type="button"
            onClick={paste}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs"
          >
            Paste
          </button>
        </div>
      ) : (
        <input
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="fairlife 2% ultra filtered"
          aria-label="The words to search"
          className="rounded-lg border border-line bg-surface p-2 text-base"
        />
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || text.trim() === ""}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Remember this"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** What the refresh last saw for an exact-product brand (TEC-90). Mirrors `BrandProduct` in `lib/krogerStore.ts`, which a client cannot import. */
type Checked = {
  description: string | null;
  size: string | null;
  url: string | null;
  price: number | null;
  in_stock: boolean | null;
  missing_since: string | null;
  checked_at: string;
};

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One line under a product brand: what Kroger said, or that it stopped saying anything. */
function CheckedLine({ checked }: { checked: Checked }) {
  if (checked.missing_since) {
    // **Flagged, never dropped** (2026-10-20): the brand was chosen by hand,
    // so it stays until a replacement is too — edit it with a new product page.
    return (
      <span className="block text-xs text-danger">
        Kroger no longer returns this product (since {day(checked.missing_since)}). Edit it with a new product page, or forget it.
      </span>
    );
  }
  const bits = [
    checked.description,
    checked.size,
    checked.price !== null ? `$${checked.price.toFixed(2)}` : null,
    checked.in_stock === false ? "out of stock" : checked.in_stock ? "in stock" : null,
  ].filter(Boolean);
  return (
    <span className="block text-[11px] text-ink-soft">
      {bits.join(" · ")} — checked {day(checked.checked_at)}
    </span>
  );
}

/** Your brands, grouped: phrases alphabetical, a phrase's products most counted first (TEC-51). */
function ordered(preferences: Preference[]): Preference[] {
  return [...preferences].sort((a, b) => {
    const phrase = a.phrase.toLowerCase().localeCompare(b.phrase.toLowerCase());
    if (phrase !== 0) return phrase;
    const counted = (b.tally ?? 0) - (a.tally ?? 0);
    return counted !== 0 ? counted : b.updated_at.localeCompare(a.updated_at);
  });
}

const STATUS_WORDS: Record<PreviewEntry["status"], string> = {
  new: "new",
  adds: "another choice",
  already: "already in Your brands",
  replaces: "replaces what is saved",
  refused: "refused",
};

/**
 * Paste a batch's review (TEC-51): **every row, with a tick, before anything is
 * written.** New rows start ticked; a row already in Your brands, or one that
 * would replace a saved row, starts unticked and says what is there now — it is
 * never overwritten unless ticked. Refused rows show why and cannot be ticked.
 * A local pattern: a checklist of status chips, on the theme's tokens.
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
  const writable = entries.filter((e) => e.status !== "refused").length;
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-accent p-2">
      <p className="text-xs text-ink-soft">
        {entries.length} row{entries.length === 1 ? "" : "s"} · {writable} can be written · nothing is saved until you tap Write.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {entries.map((e, i) => {
          const on = ticked.has(i);
          const product = e.kind === "product" ? (e.productId ? `product ${e.productId}` : e.url) : `“${e.terms}”`;
          return (
            <li key={i} className="flex items-baseline gap-2 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={on}
                disabled={e.status === "refused"}
                onChange={() => props.toggle(i)}
                aria-label={`Write ${e.phrase || `row ${e.row}`}`}
                className="size-4 shrink-0 accent-accent disabled:opacity-40"
              />
              <span className="min-w-0 flex-1">
                <b>{e.phrase || `Row ${e.row}`}</b>
                {e.status !== "refused" ? (
                  <>
                    {" → "}
                    {e.kind === "product" && e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                        {product}
                      </a>
                    ) : (
                      product
                    )}
                    {e.kind === "product" ? <span className="text-ink-soft"> · count {e.count ?? (e.existing?.count ?? 0)}</span> : null}
                  </>
                ) : null}
                <span
                  className={`ml-1 rounded border px-1 text-[11px] ${
                    e.status === "refused"
                      ? "border-danger/60 text-danger"
                      : e.status === "new" || e.status === "adds"
                        ? "border-accent text-accent"
                        : "border-warn/60 text-warn"
                  }`}
                >
                  {STATUS_WORDS[e.status]}
                  {e.status === "adds" && e.beside ? ` beside ${e.beside}` : ""}
                </span>
                {e.existing ? (
                  <span className="block text-[11px] text-ink-soft">
                    Saved now:{" "}
                    {e.existing.kind === "product"
                      ? `${e.existing.url ?? "a product"} · count ${e.existing.count}`
                      : e.existing.kind === "terms"
                        ? `“${e.existing.terms}”`
                        : "searched plainly"}
                    {on ? " — ticked, so it will be overwritten." : " — left as it is unless ticked."}
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
  const [preferences, setPreferences] = useState<Preference[] | null>(null);
  const [checked, setChecked] = useState<Record<string, Checked>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The row being edited, "new" for an empty form, or null for no form.
  const [editing, setEditing] = useState<Preference | "new" | null>(null);
  const [paste, setPaste] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/preferences", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read your brands.");
      setPreferences(body.preferences as Preference[]);
      setChecked((body.products ?? {}) as Record<string, Checked>);
      setError(null);
    } catch (e) {
      // Same rule as the list: a failed read stays null, never [], because
      // "you have no brands" would be a lie that reads as a fresh start.
      setError(e instanceof Error ? e.message : "Couldn't read your brands.");
    }
  }, []);

  // Read on open of the tab too, not only of the panel, so a product the refresh
  // flagged shows on the collapsed toggle rather than waiting to be found.
  useEffect(() => {
    void load();
  }, [open, load, refreshKey]);

  const flagged = (preferences ?? []).filter((p) => checked[p.id]?.missing_since).length;

  async function forget(id: string) {
    const response = await fetch("/api/preferences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    // A delete that quietly failed, followed by a reload, looks exactly like a
    // delete that worked until the row reappears.
    if (!response.ok) {
      setError((await response.json()).error ?? "Couldn't forget that one.");
      return;
    }
    await load();
    onChanged();
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
      const response = await fetch("/api/preferences/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't review that batch.");
      const entries = body.entries as PreviewEntry[];
      setPreview(entries);
      setTicked(new Set(entries.flatMap((e, i) => (e.status === "new" || e.status === "adds" ? [i] : []))));
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
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't write those.");
      // Every refusal is named. A count of failures with no reasons is how a seed
      // of forty quietly lands as thirty-eight.
      const refused = (body.rejected as { row: number; reason: string }[]) ?? [];
      const left = preview.length - rows.length;
      setOutcome(
        `Saved ${body.saved}.` +
          (left > 0 ? ` Left out ${left}.` : "") +
          (refused.length ? ` Refused ${refused.length}: ${refused.map((r) => r.reason).join("; ")}` : "")
      );
      setPreview(null);
      setPaste("");
      await load();
      onChanged();
    } catch (e) {
      setOutcome(e instanceof Error ? e.message : "Couldn't write those.");
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start text-xs text-ink-soft underline decoration-dotted underline-offset-2"
      >
        {open ? "Hide your brands" : "Your brands"}
        {flagged > 0 ? (
          <span className="ml-1 text-danger">
            · {flagged} Kroger no longer returns
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
          {error ? <p className="text-xs text-danger">{error}</p> : null}

          {preferences === null && !error ? <p className="text-xs text-ink-soft">Looking…</p> : null}

          {preferences?.length === 0 ? (
            <p className="text-xs text-ink-soft">
              Nothing yet. <b>Remember a brand</b> the next time a line&rsquo;s link takes you somewhere wrong.
            </p>
          ) : null}

          {preferences && preferences.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line">
              {ordered(preferences).map((p) => (
                <li key={p.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{p.phrase}</b>
                    <span className="text-ink-soft">
                      {p.kind === "plain"
                        ? " — searched plainly, on purpose"
                        : p.kind === "product"
                          ? ` — a product page · count ${p.tally ?? 0}`
                          : ` — “${p.terms}”`}
                    </span>
                    {p.kind === "product" && checked[p.id] ? <CheckedLine checked={checked[p.id]} /> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2"
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    onClick={() => forget(p.id)}
                    className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2"
                  >
                    forget
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {editing ? (
            <RememberForm
              // **Keyed by the row**, or the form keeps the last row's values:
              // its state is set once, so edit milk, then edit eggs, and the
              // form still said milk — and saving rewrote milk (TEC-29 item 1).
              key={editing === "new" ? "new" : editing.id}
              existing={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void load();
                onChanged();
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="rounded-lg border border-line px-3 py-1.5 text-xs"
              >
                Remember a brand
              </button>
              {/* **Export** (TEC-51): the batch format, so the file pastes back in. */}
              <a
                href="/api/preferences/export"
                download
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft"
              >
                Export
              </a>
            </div>
          )}

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
              placeholder={'[{"phrase":"oat milk","product":"0001111000001","count":3}]'}
              aria-label="A batch of preferences as JSON"
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
        </div>
      ) : null}
    </div>
  );
}
