"use client";

import { useCallback, useEffect, useState } from "react";
import type { Preference, PreferenceKind } from "@/lib/preferences";
import { isKingSoopersProduct } from "@/lib/kingsoopers";

/**
 * Your brands — the panel that lists them, and the one editor.
 *
 * **Remembering happens only here** (Joel, 2026-09-24, TEC-39). The list's lines
 * used to carry a *remember* link each; they are just the item and its link now,
 * and **Remember a brand** opens the editor empty. It lives at the bottom of the
 * King Soopers list tab, collapsed, rather than on a settings page: a preferences
 * route would be a second place to go and the only thing it would hold is this.
 *
 * **Why remembering cannot read the product you picked.** A line's link opens
 * King Soopers in a new tab, cross-origin, and this project's proxy refuses
 * kingsoopers.com server-side, so nothing here can see where you ended up. Copy
 * the product page's address there, then **Paste** here: that is the floor, and
 * Joel knows it is.
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
      // the note a batch gave it.
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: text, kind, url, terms }),
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

export default function Brands({ onChanged }: { onChanged: () => void }) {
  const [preferences, setPreferences] = useState<Preference[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The row being edited, "new" for an empty form, or null for no form.
  const [editing, setEditing] = useState<Preference | "new" | null>(null);
  const [paste, setPaste] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/preferences", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read your brands.");
      setPreferences(body.preferences as Preference[]);
      setError(null);
    } catch (e) {
      // Same rule as the list: a failed read stays null, never [], because
      // "you have no brands" would be a lie that reads as a fresh start.
      setError(e instanceof Error ? e.message : "Couldn't read your brands.");
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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

  async function importRows() {
    setOutcome(null);
    let rows: unknown;
    try {
      rows = JSON.parse(paste);
    } catch {
      setOutcome("That is not valid JSON.");
      return;
    }
    if (!Array.isArray(rows)) {
      setOutcome("Expected a JSON array of rows.");
      return;
    }

    const response = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const body = await response.json();
    if (!response.ok) {
      setOutcome(body.error ?? "Couldn't import that.");
      return;
    }
    // Every refusal is named. A count of failures with no reasons is how a seed
    // of forty quietly lands as thirty-eight.
    const refused = (body.rejected as { row: number; reason: string }[]) ?? [];
    setOutcome(
      `Saved ${body.saved}.` +
        (refused.length ? ` Refused ${refused.length}: ${refused.map((r) => `row ${r.row} — ${r.reason}`).join("; ")}` : "")
    );
    setPaste("");
    await load();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start text-xs text-ink-soft underline decoration-dotted underline-offset-2"
      >
        {open ? "Hide your brands" : "Your brands"}
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
              {preferences.map((p) => (
                <li key={p.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{p.phrase}</b>
                    <span className="text-ink-soft">
                      {p.kind === "plain"
                        ? " — searched plainly, on purpose"
                        : p.kind === "product"
                          ? " — a product page"
                          : ` — “${p.terms}”`}
                    </span>
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
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="self-start rounded-lg border border-line px-3 py-1.5 text-xs"
            >
              Remember a brand
            </button>
          )}

          {/* The receipts path. The aggregation happens in a session that has the
              receipts; this only ever sees the rows it produced, and the receipts
              themselves never reach this app or the repo. */}
          <details>
            <summary className="cursor-pointer text-xs text-ink-soft">Paste a batch</summary>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={4}
              placeholder={'[{"phrase":"milk","kind":"terms","terms":"fairlife 2%"}]'}
              aria-label="A batch of preferences as JSON"
              className="mt-2 w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={importRows}
              disabled={paste.trim() === ""}
              className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft disabled:opacity-50"
            >
              Import
            </button>
            {outcome ? <p className="mt-2 text-xs text-ink-soft">{outcome}</p> : null}
          </details>
        </div>
      ) : null}
    </div>
  );
}
