"use client";

import { useCallback, useEffect, useState } from "react";
import type { Preference, PreferenceKind } from "@/lib/preferences";

/**
 * The brands you have told it about — the editor, and the panel that lists them.
 *
 * **Both live on the shop section rather than on a settings page.** The surface
 * is settled as *site*: one long page, a thin index by verb. A preferences route
 * would be a second place to go and the only thing it would hold is this.
 */

const KINDS: { value: PreferenceKind; label: string; hint: string }[] = [
  { value: "product", label: "This exact product", hint: "Paste the King Soopers page you buy from." },
  { value: "terms", label: "Better search words", hint: "What you would type in the shop's search box." },
  { value: "plain", label: "Just search it plainly", hint: "Use this to stop a broader brand reaching this line." },
];

export function RememberForm({
  phrase,
  existing,
  onSaved,
  onCancel,
}: {
  phrase: string;
  existing: Preference | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(existing?.phrase ?? phrase);
  const [kind, setKind] = useState<PreferenceKind>(existing?.kind ?? "terms");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: text, kind, url, terms, brand }),
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
      <label className="text-xs text-ink-soft">
        Whenever a line mentions
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-base"
          aria-label="The words to match on"
        />
      </label>
      {/* Said out loud, because it is the whole rule and it is not obvious from a
          text box: the narrower phrase is the one that decides. */}
      <p className="text-[11px] text-ink-soft">
        Write it the way you shop — <b>milk</b>, not <b>2% milk 52oz</b>. The longest phrase that
        matches a line wins, so a narrower one you add later quietly takes over.
      </p>

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
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kingsoopers.com/p/…"
          aria-label="The product page"
          className="rounded-lg border border-line bg-surface p-2 text-base"
        />
      ) : null}
      {kind === "terms" ? (
        <input
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="fairlife 2% ultra filtered"
          aria-label="The words to search"
          className="rounded-lg border border-line bg-surface p-2 text-base"
        />
      ) : null}

      <input
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        placeholder="Brand, so the line can say what it picked (optional)"
        aria-label="Brand"
        className="rounded-lg border border-line bg-surface p-2 text-sm"
      />

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

export default function Brands({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [preferences, setPreferences] = useState<Preference[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
  }, [open, load, version]);

  async function forget(id: string) {
    await fetch("/api/preferences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
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
              Nothing yet. Tap <b>remember</b> beside a line the next time its link takes you
              somewhere wrong.
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
                          ? ` — ${p.brand ?? "a product page"}`
                          : ` — “${p.terms}”`}
                    </span>
                  </span>
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

          {/* The receipts path. The aggregation happens in a session that has the
              receipts; this only ever sees the rows it produced, and the receipts
              themselves never reach this app or the repo. */}
          <details>
            <summary className="cursor-pointer text-xs text-ink-soft">Paste a batch</summary>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={4}
              placeholder={'[{"phrase":"milk","kind":"terms","terms":"fairlife 2%","brand":"Fairlife"}]'}
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
