"use client";

import { useCallback, useEffect, useState } from "react";
import { asText, type GroceryItem, type TidyLine } from "@/lib/grocery";
import type { ResolvedLink } from "@/lib/preferences";
import Brands from "./Brands";
import { useToast } from "./Toast";

/**
 * A line as the server hands it over: the row, plus where its link should go and
 * what decided that. **The browser never matches a preference itself** — see
 * `app/api/grocery/route.ts`.
 */
type ShoppingLine = GroceryItem & ResolvedLink;

/**
 * The shopping list — the other half of the book.
 *
 * **You shop from recipes, not from what you ate.** That is why this sits beside
 * the book rather than beside a food log, settled with Joel on 2026-09-20.
 *
 * **Named for where it goes, since 2026-09-22.** Every link on it is a King
 * Soopers search, so "What to buy" was a word vaguer than the thing deserves.
 *
 * **The cheap version, on purpose** — reconfirmed by Joel on 2026-09-21 when a
 * do-not-substitute rule and a delivery/pickup toggle were put to this app. Both
 * are Kroger account settings that a search link cannot carry; building them here
 * would be re-opening the cart push rather than adding a feature. The list leaves
 * as a block of text you copy or a King Soopers search you tap. No stored retailer credential, no OAuth, no
 * `middleware.ts` carve-out — the expensive version needs all three and the only
 * thing it buys is who does the tapping.
 */
export default function List({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<ShoppingLine[] | null>(null);
  // The read only; everything else is a toast. Same split as the book.
  const [readError, setReadError] = useState<string | null>(null);
  const toast = useToast();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "adding" | "tidying" | "applying">(null);
  const [proposal, setProposal] = useState<TidyLine[] | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/grocery", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the list.");
      setItems(body.items as ShoppingLine[]);
      setReadError(null);
    } catch (e) {
      // Same discipline as the book: a failed read leaves `items` null rather
      // than empty, because "buy nothing" and "we could not look" are opposite
      // messages that render identically.
      setReadError(e instanceof Error ? e.message : "Couldn't read the list.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function add() {
    const lines = typed.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0 || busy) return;
    setBusy("adding");
    try {
      const response = await fetch("/api/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't add that.");
      setTyped("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(null);
    }
  }

  async function tick(item: GroceryItem) {
    // Optimistic, and safe to be: the checkbox is the one control you use with a
    // trolley in one hand, and a round trip per tap makes it feel broken. A
    // failed write reloads the truth back over it.
    setItems((current) =>
      (current ?? []).map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i))
    );
    try {
      const response = await fetch("/api/grocery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, checked: !item.checked }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't tick that off.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't tick that off.");
      await load();
    }
  }

  /**
   * Empty the list — every line, ticked or not.
   *
   * **Two taps, because there is no undo.** `clearBought` removes what you have
   * already put in the trolley and is close to harmless; this one throws away
   * the shopping you have not done yet, including anything a recipe pushed on.
   * A bare button next to "Copy the list" is one mis-tap from losing the week's
   * shop, so the confirm is the feature, not decoration.
   */
  async function clearEverything() {
    const all = (items ?? []).map((i) => i.id);
    if (all.length === 0) return;
    try {
      const response = await fetch("/api/grocery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: all }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't clear the list.");
      setItems([]);
      setConfirmingClear(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't clear the list.");
    }
  }

  async function clearBought() {
    const bought = (items ?? []).filter((i) => i.checked).map((i) => i.id);
    if (bought.length === 0) return;
    try {
      const response = await fetch("/api/grocery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: bought }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't clear those.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't clear those.");
    }
  }

  async function propose() {
    if (busy) return;
    setBusy("tidying");
    try {
      const response = await fetch("/api/grocery/tidy", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't work out a tidier list.");
      setProposal(body.lines as TidyLine[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't work out a tidier list.");
    } finally {
      setBusy(null);
    }
  }

  async function applyProposal() {
    if (!proposal || busy) return;
    setBusy("applying");
    try {
      const response = await fetch("/api/grocery/tidy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: proposal }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't apply that.");
      setProposal(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply that.");
    } finally {
      setBusy(null);
    }
  }

  async function copyList() {
    const text = asText(items ?? []);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused often enough — an insecure origin, a
      // permission prompt declined — that failing silently would look like the
      // button doing nothing. Say so instead.
      toast.error("Couldn't reach the clipboard. Select the lines and copy them by hand.");
    }
  }

  const open = (items ?? []).filter((i) => !i.checked);
  const bought = (items ?? []).filter((i) => i.checked);

  return (
    <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
      {/* **Adding sits at the top**, Joel on 2026-09-22. It is what you do most
          on this tab, and under the list and the brands panel it was a scroll
          away on a phone. Clearing what you bought stays under the list, next to
          the lines it clears. */}
      <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
        {/* Named, Joel on 2026-09-24 (TEC-39): the same frame as "Add a recipe"
            on the other tab, so both tabs open on a box that says what it is. */}
        <h2 className="text-base font-semibold">Add items</h2>
        <textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          rows={2}
          placeholder={"Milk\nEggs — the big box"}
          aria-label="Add to the list, one per line"
          className="rounded-lg border border-line bg-surface p-3 text-base"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={add}
            disabled={typed.trim() === "" || busy !== null}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy === "adding" ? "Adding…" : "Add to the list"}
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          One line each. Anything after an em dash is a note for the shop — it is not searched,
          because &ldquo;the small tin&rdquo; narrows a search to nothing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">King Soopers list</h2>
        {items !== null ? (
          <span className="text-xs text-ink-soft">
            {open.length} to get{bought.length > 0 ? `, ${bought.length} in the trolley` : ""}
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={copyList}
            disabled={open.length === 0}
            className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy the list"}
          </button>
          <button
            type="button"
            onClick={propose}
            disabled={open.length < 2 || busy !== null}
            className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {busy === "tidying" ? "Thinking…" : "Tidy"}
          </button>
          {confirmingClear ? (
            <>
              <button
                type="button"
                onClick={clearEverything}
                className="rounded border border-danger/60 px-3 py-1.5 text-sm text-danger"
              >
                Clear {(items ?? []).length} — sure?
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={(items ?? []).length === 0}
              className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* **A tidy is shown before it happens.** Merging two lines into one is
          right where losing a line is not, and the two look identical until you
          read them. `validateTidy` has already refused anything that drops or
          doubles a line; this is for the judgement it cannot make. */}
      {proposal ? (
        <div className="rounded-lg border border-accent bg-surface p-3">
          <h3 className="text-sm font-semibold">{proposal.length} lines instead of {open.length}</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {proposal.map((line, n) => (
              <li key={n}>
                {line.name}
                {line.note ? <span className="text-ink-soft"> — {line.note}</span> : null}
                <span className="text-[11px] text-ink-soft"> ({line.absorbed.length})</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              Leave it
            </button>
            <button
              type="button"
              onClick={applyProposal}
              disabled={busy !== null}
              className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {busy === "applying" ? "Tidying…" : "Use this list"}
            </button>
          </div>
        </div>
      ) : null}

      {items === null ? (
        readError ? (
          <p role="alert" className="text-sm text-danger">
            {readError}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Reading the list…</p>
        )
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
          Nothing on it. Add a recipe&rsquo;s ingredients from the book, or type what you need.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1 px-1">
              {/* **The checkbox is its own tap target, with a gap before the
                  name**, so ticking a line in the shop never opens King Soopers
                  (TEC-39). The label pads it to a thumb's width. */}
              <label className="flex shrink-0 cursor-pointer items-center self-stretch px-2 py-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => tick(item)}
                  aria-label={`Got ${item.name}`}
                  className="size-4 accent-accent"
                />
              </label>
              <span className={`min-w-0 flex-1 py-2 pr-2 text-sm ${item.checked ? "text-ink-soft line-through" : ""}`}>
                {/* **The name is the link** (Joel, 2026-09-24). It goes to your
                    remembered product or search when one decides this line, and
                    to a plain search of the name when none does — the server
                    resolved which. */}
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line decoration-dotted underline-offset-2"
                >
                  {item.name}
                </a>
                {item.note ? <span className="text-ink-soft"> — {item.note}</span> : null}
                {/* Where the line came from: the recipes by name, plain text
                    (TEC-39 B). A recipe line from before the names were kept
                    still says only "from a recipe"; a typed line says nothing. */}
                {item.recipes.length > 0 ? (
                  <span className="text-[11px] text-ink-soft"> · {item.recipes.join(", ")}</span>
                ) : item.source === "recipe" ? (
                  <span className="ml-1.5 text-[11px] text-ink-soft">from a recipe</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {bought.length > 0 ? (
        <button
          type="button"
          onClick={clearBought}
          className="self-end rounded-lg border border-line px-3 py-2 text-sm text-ink-soft"
        >
          Clear the {bought.length} bought
        </button>
      ) : null}

      {/* Remembering a brand happens only in here, since 2026-09-24 (TEC-39). */}
      <Brands onChanged={() => void load()} />

    </section>
  );
}
