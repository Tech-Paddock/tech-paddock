"use client";

import { useCallback, useEffect, useState } from "react";
import { asText, searchUrl, type GroceryItem } from "@/lib/grocery";

type TidyLine = { name: string; note: string | null; absorbed: string[] };

/**
 * Add things, tick them off in the shop, and take the list to King Soopers.
 *
 * **The list leaves as text or as a search link, and that is the whole of the
 * integration.** No stored credential, no OAuth, no change to the password
 * gate. What the expensive version would add is that the basket is already
 * full when you arrive; what it would cost is a token that acts as you at a
 * retailer and a carve-out in the one file this app may not touch.
 */
export default function List() {
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "adding" | "tidying" | "applying">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [proposal, setProposal] = useState<TidyLine[] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/grocery", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the list.");
      setItems(body.items as GroceryItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the list.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!name.trim() || busy) return;
    setBusy("adding");
    setError(null);
    try {
      const response = await fetch("/api/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't add that.");
      setName("");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(null);
    }
  }

  async function tick(item: GroceryItem) {
    setError(null);
    // Optimistic: ticking in a shop should not wait on a round trip.
    setItems((current) =>
      (current ?? []).map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i))
    );
    try {
      const response = await fetch("/api/grocery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, checked: !item.checked }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't change that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change that.");
      await load();
    }
  }

  async function remove(ids: string[]) {
    setError(null);
    try {
      const response = await fetch("/api/grocery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't remove that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that.");
    }
  }

  async function tidy() {
    if (busy) return;
    setBusy("tidying");
    setError(null);
    try {
      const response = await fetch("/api/grocery/tidy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't tidy that.");
      setProposal(body.proposal as TidyLine[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't tidy that.");
    } finally {
      setBusy(null);
    }
  }

  async function applyTidy() {
    if (!proposal || busy) return;
    setBusy("applying");
    setError(null);
    try {
      const response = await fetch("/api/grocery/tidy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: proposal }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't apply that.");
      setProposal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't apply that.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!items) return;
    try {
      await navigator.clipboard.writeText(asText(items));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser would not let the page copy. Select the list and copy it by hand.");
    }
  }

  const open = (items ?? []).filter((i) => !i.checked);
  const done = (items ?? []).filter((i) => i.checked);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <label htmlFor="item" className="text-sm font-medium">Add to the list</label>
        <div className="flex gap-2">
          <input
            id="item"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder="Garlic"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <input
            id="note"
            aria-label="How much, or which kind"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder="2 bulbs"
            className="w-28 shrink-0 rounded-lg border border-line bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!name.trim() || busy !== null}
          className="rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy === "adding" ? "Adding…" : "Add"}
        </button>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* A proposal is not the list. Approving is what writes. */}
      {proposal ? (
        <section className="rounded-lg border border-line bg-surface">
          <header className="border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">
              {open.length} lines become {proposal.length}
            </h2>
          </header>
          <ul className="divide-y divide-line">
            {proposal.map((line, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 p-3 text-sm">
                <span>{line.name}</span>
                {line.note ? <span className="text-ink-soft">{line.note}</span> : null}
                {line.absorbed.length > 1 ? (
                  <span className="ml-auto text-[11px] text-ink-soft">
                    merges {line.absorbed.length}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <footer className="flex gap-2 border-t border-line px-3 py-3">
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              Leave it
            </button>
            <button
              type="button"
              onClick={applyTidy}
              disabled={busy !== null}
              className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {busy === "applying" ? "Applying…" : "Use this"}
            </button>
          </footer>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">To buy</h2>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={open.length === 0}
              className="rounded border border-line px-2 py-1.5 text-sm disabled:opacity-50"
            >
              {copied ? "Copied" : "Copy list"}
            </button>
            <button
              type="button"
              onClick={tidy}
              disabled={open.length < 2 || busy !== null}
              className="rounded border border-line px-2 py-1.5 text-sm disabled:opacity-50"
            >
              {busy === "tidying" ? "Tidying…" : "Tidy"}
            </button>
          </div>
        </div>

        {/* An empty list and an unread list must not render the same. */}
        {items === null ? (
          <p className="text-sm text-ink-soft">Reading the list…</p>
        ) : open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing to buy.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3">
                <input
                  type="checkbox"
                  id={`tick-${item.id}`}
                  checked={item.checked}
                  onChange={() => tick(item)}
                  aria-label={`Tick off ${item.name}`}
                  className="size-5 shrink-0 accent-accent"
                />
                <span className="min-w-0 flex-1 text-sm">
                  {item.name}
                  {item.note ? <span className="block text-[11px] text-ink-soft">{item.note}</span> : null}
                </span>
                <a
                  href={searchUrl(item)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded border border-line px-2 py-1 text-[11px] text-ink-soft"
                >
                  Find it
                </a>
                <button
                  type="button"
                  onClick={() => remove([item.id])}
                  aria-label={`Remove ${item.name}`}
                  className="shrink-0 rounded border border-line px-2 py-1 text-sm text-ink-soft"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">In the basket</h2>
            <button
              type="button"
              onClick={() => remove(done.map((i) => i.id))}
              className="ml-auto rounded border border-line px-2 py-1.5 text-sm text-ink-soft"
            >
              Clear {done.length}
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {done.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  id={`untick-${item.id}`}
                  checked
                  onChange={() => tick(item)}
                  aria-label={`Put ${item.name} back on the list`}
                  className="size-4 shrink-0 accent-accent"
                />
                <span className="line-through">{item.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
