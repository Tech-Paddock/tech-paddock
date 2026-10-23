"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_QUANTITY, asText, type GroceryItem, type TidyLine } from "@/lib/grocery";
import type { ResolvedLink } from "@/lib/preferences";
import type { LineMark } from "@/lib/brands";
import type { MenuEntry } from "@/lib/menu";
import { menuDayLabel } from "@/lib/menuDay";
import { MODALITIES, modalityWord, type Modality } from "@/lib/modality";
import { saleTags, saleText, type SaleTag } from "@/lib/saleTag";
import { CartBar, CartPanel, SendView, useCart } from "./Cart";
import { useToast } from "./Toast";

/**
 * A line as the server hands it over: the row, plus where its link should go and
 * what decided that. **The browser never matches a preference itself** — see
 * `app/api/grocery/route.ts`.
 */
type ShoppingLine = GroceryItem &
  ResolvedLink & {
    /**
     * The line as what you buy (TEC-131; `lib/lineView.ts`): the item without
     * prep words or a saved product's shopping unit, the combined amount, and
     * the note unless it was only amounts. Display only.
     */
    view?: { name: string; amount: string | null; note: string | null };
    /** ★ default saved · ? needs a pick at Send · + not saved yet (TEC-135; `lineMark`). */
    mark?: LineMark;
  };

/** What follows the name, small: the recipes, then the amount, then a typed note (TEC-131). */
function details(item: ShoppingLine): string[] {
  const recipes = item.recipes.length > 0 ? item.recipes.join(" · ") : item.source === "recipe" ? "from a recipe" : "by hand";
  const note = item.view ? item.view.note : item.note;
  return [recipes, item.view?.amount ?? null, note].filter((x): x is string => !!x);
}

const LINK = "text-[13px] text-accent underline-offset-2 hover:underline disabled:opacity-50";
const HEADING = "text-xs font-bold uppercase tracking-wider text-ink-soft";
const MARK_TONE: Record<LineMark, string> = { "★": "text-accent", "?": "text-warn", "+": "text-ink-soft" };
const MARK_WORDS: Record<LineMark, string> = { "★": "Your default", "?": "Needs a pick at Send", "+": "Not saved yet" };

/**
 * The King Soopers list (TEC-135, the owner's mockup of 2026-10-23).
 *
 * **You shop from recipes, not from what you ate.** That is why this sits beside
 * the book rather than beside a food log, settled on 2026-09-20. **Named for
 * where it goes, since 2026-09-22.**
 *
 * Top to bottom: the header (how many are **Still to buy**, the estimate, the
 * store, Pickup/Delivery), the add box, **Cooking this week**, the lines with
 * a ★ / ? / + marker each, the King Soopers panel, and **Send to cart** and
 * **Take back** at the bottom. Send to cart opens the review in place of the
 * list (`SendView`, `Cart.tsx`).
 *
 * **It leaves three ways**: a block of text you copy, a King Soopers search you
 * tap, or **Send to cart** — the no-OAuth rule was reversed for King Soopers on
 * 2026-09-26 (TEC-90). Still no `proxy.ts` carve-out. Each line carries a
 * quantity for the cart, default 1.
 *
 * Local patterns: the marker column, the menu strip's chips and the
 * Pickup/Delivery segmented switch. They reuse the theme's tokens only.
 */
export default function List({
  refreshKey,
  onBrandsChanged,
  recipeNames,
}: {
  refreshKey: number;
  onBrandsChanged?: () => void;
  /** Recipe names by id, from the book, for Cooking this week. */
  recipeNames?: Map<string, string>;
}) {
  const [items, setItems] = useState<ShoppingLine[] | null>(null);
  // The read only; everything else is a toast. Same split as the book.
  const [readError, setReadError] = useState<string | null>(null);
  const toast = useToast();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "adding" | "tidying" | "applying">(null);
  const [proposal, setProposal] = useState<TidyLine[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloads, setReloads] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/grocery", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the list.");
      setItems(body.items as ShoppingLine[]);
      setReadError(null);
    } catch (e) {
      // A failed read leaves `items` null rather than empty, because "buy
      // nothing" and "we could not look" are opposite messages.
      setReadError(e instanceof Error ? e.message : "Couldn't read the list.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey, reloads]);

  // A refresh or a send changes Your brands, which is its own tab since
  // TEC-131; the tab is told so it reads again. A send changes what is sent here.
  const cart = useCart({
    onBrandsChanged: () => onBrandsChanged?.(),
    onListChanged: () => setReloads((n) => n + 1),
  });

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

  /** How many to put in the cart. Saved on blur or Enter; a refused write reloads the truth. */
  async function setQuantity(item: GroceryItem, quantity: number) {
    if (quantity === item.quantity) return;
    setItems((current) => (current ?? []).map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    try {
      const response = await fetch("/api/grocery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, quantity }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't change how many.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change how many.");
      await load();
    }
  }

  async function tick(item: GroceryItem) {
    // Optimistic: the checkbox is the one control you use with a trolley in
    // one hand. A failed write reloads the truth back over it.
    setItems((current) => (current ?? []).map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
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
   * Empty the list — every line, ticked or not. **Two taps, because there is
   * no undo**: this throws away the shopping you have not done yet.
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
      // Refused often enough that failing silently would look like a dead button.
      toast.error("Couldn't reach the clipboard. Select the lines and copy them by hand.");
    }
  }

  const open = (items ?? []).filter((i) => !i.checked);
  const bought = (items ?? []).filter((i) => i.checked);
  // **On sale at the chosen store** (TEC-121 3a): the latest scan and the last
  // estimate the cart holds; no Kroger call per render. Open lines only.
  const locationId = cart.status?.connected ? (cart.status.store?.locationId ?? null) : null;
  const onSale = useMemo(
    () =>
      saleTags(
        (items ?? []).filter((i) => !i.checked),
        { locationId, scan: cart.latestScan, estimate: cart.estimate?.estimate ?? null }
      ),
    [items, locationId, cart.latestScan, cart.estimate]
  );

  // **The review replaces the list** (the mockup's Send to cart screen), with a way back.
  if (cart.review !== null) {
    return (
      <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
        <SendView cart={cart} />
      </section>
    );
  }

  const total = cart.estimate?.estimate.total ?? null;
  const status = cart.status;

  return (
    <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
      {/* The header: the count, the estimate, the store and Pickup/Delivery. */}
      <div className="flex items-end justify-between gap-3 px-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-bold">King Soopers list</h2>
          <p className="text-[13px] text-ink-soft">
            {items !== null ? `${open.length} still to buy` : "Reading…"}
            {cart.ready ? (
              <>
                {" · "}
                {total !== null ? (
                  <button type="button" onClick={() => cart.setShowEstimate(true)} className="underline-offset-2 hover:underline">
                    about ${Math.round(total)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void cart.calculate()}
                    disabled={cart.estimating}
                    className="text-accent underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {cart.estimating ? "estimating…" : "estimate it"}
                  </button>
                )}
                {status?.store ? ` · ${status.store.name}` : ""}
              </>
            ) : null}
          </p>
        </div>
        {cart.ready && status ? (
          <ModeSwitch value={status.modality} onChange={(m) => void cart.chooseModality(m)} disabled={cart.busy === "send" || cart.busy === "take-back"} />
        ) : null}
      </div>

      {/* **Adding sits at the top** (2026-09-22): it is what you do most here. */}
      <div className="flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Add an item — notes after a dash"
          aria-label="Add an item"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-base"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={typed.trim() === "" || busy !== null}
          className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy === "adding" ? "Adding…" : "Add"}
        </button>
      </div>

      <CookingThisWeek refreshKey={refreshKey} recipeNames={recipeNames} />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2">
          <h3 className={HEADING}>Still to buy · {open.length}</h3>
          <div className="flex flex-wrap gap-3.5">
            <button type="button" onClick={copyList} disabled={open.length === 0} className={LINK}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={propose} disabled={open.length < 2 || busy !== null} className={LINK}>
              {busy === "tidying" ? "Thinking…" : "Tidy"}
            </button>
            <button type="button" onClick={clearBought} disabled={bought.length === 0} className={LINK}>
              Clear ticked
            </button>
            {confirmingClear ? (
              <>
                <button type="button" onClick={clearEverything} className="text-[13px] text-danger underline-offset-2 hover:underline">
                  Clear all {(items ?? []).length} — sure?
                </button>
                <button type="button" onClick={() => setConfirmingClear(false)} className={LINK}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingClear(true)} disabled={(items ?? []).length === 0} className={LINK}>
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* **A tidy is shown before it happens.** `validateTidy` has already
            refused anything that drops or doubles a line; this is for the
            judgement it cannot make. */}
        {proposal ? (
          <div className="rounded-xl border border-accent bg-surface p-3">
            <h3 className="text-sm font-semibold">
              {proposal.length} lines instead of {open.length}
            </h3>
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
              <button type="button" onClick={() => setProposal(null)} className="rounded-lg border border-line px-3 py-2 text-sm">
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
            <p role="alert" className="px-2 text-sm text-danger">
              {readError}
            </p>
          ) : (
            <p className="px-2 text-sm text-ink-soft">Reading the list…</p>
          )
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing on it. Add a recipe&rsquo;s ingredients from the book, or type what you need.
          </p>
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-xl bg-surface">
            {items.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                sale={onSale.get(item.id) ?? null}
                onTick={() => void tick(item)}
                onQuantity={(q) => void setQuantity(item, q)}
              />
            ))}
          </ul>
        )}
        <p className="px-2 text-xs text-ink-soft">★ default saved · ? needs a pick at Send · + not saved yet</p>
      </div>

      {/* Send to cart, King Soopers (TEC-90): connection, store, estimate, Take back, deals. */}
      <CartPanel cart={cart} />
      <CartBar cart={cart} />
    </section>
  );
}

/**
 * One line: its tick, the name (the link: your remembered product or a
 * search, as the server resolved it), what follows small, its marker and how
 * many. **The tick is its own tap target**, so ticking in the shop never opens
 * King Soopers (TEC-39).
 */
function ListRow(props: { item: ShoppingLine; sale: SaleTag | null; onTick: () => void; onQuantity: (q: number) => void }) {
  const { item } = props;
  const mark = item.mark ?? "+";
  return (
    <li className="flex min-h-12 items-center gap-2.5 border-t border-line/40 px-3.5 py-2.5 first:border-t-0">
      <label className="flex shrink-0 cursor-pointer items-center self-stretch">
        <input type="checkbox" checked={item.checked} onChange={props.onTick} aria-label={`Got ${item.name}`} className="size-6 accent-accent" />
      </label>
      <span className="flex min-w-0 flex-1 flex-col">
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={`text-[15px] font-semibold ${item.checked ? "text-ink-soft line-through" : ""}`}
        >
          {item.view?.name ?? item.name}
        </a>
        <span className="truncate text-xs text-ink-soft">
          {/* **On sale at the chosen store** (TEC-121 3a). Says sale, never coupon. */}
          {props.sale ? <span className="mr-1 whitespace-nowrap rounded border border-accent px-1 text-[11px] text-accent">{saleText(props.sale)}</span> : null}
          {details(item).join(" · ")}
        </span>
      </span>
      {!item.checked ? (
        <span title={MARK_WORDS[mark]} aria-label={MARK_WORDS[mark]} className={`w-3.5 shrink-0 text-center text-sm font-bold ${MARK_TONE[mark]}`}>
          {mark}
        </span>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <Quantity key={`${item.id}:${item.quantity}`} item={item} onCommit={props.onQuantity} />
    </li>
  );
}

/** Pickup or Delivery (TEC-121), remembered on the connection. A segmented switch, `aria-pressed`. */
function ModeSwitch({ value, onChange, disabled }: { value: Modality; onChange: (m: Modality) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Pickup or delivery" className="flex shrink-0 gap-0.5 rounded-[10px] bg-raised p-[3px]">
      {MODALITIES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          disabled={disabled}
          onClick={() => value !== m && onChange(m)}
          className={`min-h-9 rounded-lg px-2.5 text-xs capitalize disabled:opacity-50 ${value === m ? "bg-surface font-bold text-ink" : "text-ink-soft"}`}
        >
          {modalityWord(m)}
        </button>
      ))}
    </div>
  );
}

/**
 * **Cooking this week** (TEC-135): the menu as a strip of day and recipe, with
 * Clear (two taps). Moving a day or opening a recipe stays on the book's *On
 * the menu*; this reads the same rows.
 */
function CookingThisWeek({ refreshKey, recipeNames }: { refreshKey: number; recipeNames?: Map<string, string> }) {
  const [menu, setMenu] = useState<MenuEntry[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/menu", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the menu.");
      setMenu(body.menu as MenuEntry[]);
    } catch {
      // The strip is a glance; the book's menu says why it couldn't read.
      setMenu(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function clear() {
    setConfirming(false);
    const before = menu;
    setMenu([]);
    try {
      const response = await fetch("/api/menu", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't clear the menu.");
    } catch (e) {
      setMenu(before);
      toast.error(e instanceof Error ? e.message : "Couldn't clear the menu.");
    }
  }

  const shown = (menu ?? []).filter((m) => recipeNames?.has(m.recipe_id));
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-2">
        <h3 className={HEADING}>Cooking this week</h3>
        {confirming ? (
          <span className="flex gap-3">
            <button type="button" onClick={() => void clear()} className="text-[13px] text-danger underline-offset-2 hover:underline">
              Clear — sure?
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={LINK}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={LINK}>
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {shown.map((m) => (
          <span key={m.recipe_id} className="whitespace-nowrap rounded-[10px] bg-surface px-3 py-2 text-[13px]">
            <b>{menuDayLabel(m.day).split(" ")[0]}</b> {recipeNames?.get(m.recipe_id)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * How many of a line go in the cart (TEC-90). A local draft so typing "12"
 * does not save "1" first; it commits on blur or Enter, and anything that is not
 * a whole number from 1 to 99 snaps back. Keyed by the saved value, so a reload
 * resets the draft.
 */
function Quantity({ item, onCommit }: { item: GroceryItem; onCommit: (q: number) => void }) {
  const [draft, setDraft] = useState(String(item.quantity));
  function commit() {
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY) onCommit(n);
    else setDraft(String(item.quantity));
  }
  return (
    <label className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-raised px-2 py-1 text-sm font-semibold">
      ×
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        inputMode="numeric"
        aria-label={`How many ${item.name}`}
        className="w-6 bg-transparent text-center"
      />
    </label>
  );
}
