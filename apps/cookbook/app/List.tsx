"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { typedLines } from "@/lib/typedLines";
import { MAX_QUANTITY, asText } from "@/lib/groceryText";
import type { GroceryItem, TidyLine } from "@/lib/grocery";
import { confirmWords, type ConfirmKind } from "@/lib/cartGuess";
import { tickedLast } from "@/lib/listOrder";
import type { ResolvedLink } from "@/lib/preferences";
import type { MenuEntry } from "@/lib/menu";
import { menuDayLabel } from "@/lib/menuDay";
import { MODALITIES, modalityWord, type Modality } from "@/lib/modality";
import { bestEmptyWords, bubbleText, shadeWord, type LineDeal } from "@/lib/lineDeal";
import type { Shade } from "@/lib/dealSignal";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { totalsOf, type LinePrice, type Totals } from "@/lib/listPrices";
import { shortDay } from "@/lib/dealFilter";
import { checkLine, clock } from "@/lib/checkLine";
import { ProductSplash, RefreshLog, StorePicker, TakeBackResults, useCart, when } from "./Cart";
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
    /** This line's price from the nightly check, or null for "no price yet" (TEC-190; `lib/listPrices.ts`). */
    price?: LinePrice | null;
    /** The sale/coupon bubble, the shade and Best, from the nightly prices (TEC-196; `lib/lineDeal.ts`). */
    deal?: LineDeal | null;
  };

const money = (n: number) => `$${n.toFixed(2)}`;

/** "about $21.46 · 1 no price yet", or "no price yet" when nothing is priced. Never $0. */
function totalWords(t: Totals, lines: number): string {
  if (lines === 0) return "";
  if (t.total === null) return "no price yet";
  return `about ${money(t.total)}${t.unpriced > 0 ? ` · ${t.unpriced} no price yet` : ""}`;
}

/**
 * **A line is shaded by its deal** (TEC-196), in the Deals board's own tints: the
 * accent for good and the danger colour for bad, as a 4px left edge (the board's
 * edge) and a faint wash over the row's own ground. Plain rows keep a clear edge
 * so the ticks line up. Colour is never the only cue: the bubble or "Good price" /
 * "High price" says why. The wash is 8%, where `tests/dealShade.test.ts` holds
 * every text colour on it at 4.5:1 in light and dark.
 */
const SHADE_CLASS: Record<Shade, string> = {
  plain: "border-l-4 border-l-transparent",
  good: "border-l-4 border-l-accent bg-gradient-to-r from-accent/[0.08] to-accent/[0.08]",
  bad: "border-l-4 border-l-danger bg-gradient-to-r from-danger/[0.08] to-danger/[0.08]",
};

/**
 * What says why a line is shaded, in words: the bubble (a sale or a coupon) and
 * "Good price" / "High price" with its reason. **One line per item** (TEC-211):
 * the row shows item, qty and price only, so this rides on the price's `title`
 * and accessible name, where colour is not the only cue.
 */
function dealWords(deal: LineDeal | null | undefined): string | null {
  const why = deal && deal.shade !== "plain" ? `${shadeWord(deal)}, ${deal.reason}` : null;
  return [bubbleText(deal), why].filter((x): x is string => !!x).join(" · ") || null;
}

const LINK = "text-[13px] text-accent underline-offset-2 hover:underline disabled:opacity-50";
const HEADING = "text-xs font-bold uppercase tracking-wider text-ink-soft";
const TONE = { good: "text-accent", bad: "text-danger", warn: "text-warn", plain: "text-ink-soft" } as const;

/**
 * The King Soopers list (TEC-135, the owner's mockup of 2026-10-23).
 *
 * **You shop from recipes, not from what you ate.** That is why this sits beside
 * the book rather than beside a food log, settled on 2026-09-20. **Named for
 * where it goes, since 2026-09-22.**
 *
 * Top to bottom: the header (how many are **Still to buy**, the live cart total, and
 * **King Soopers**: the live status, the store, Pickup/Delivery, Refresh now; TEC-211),
 * **Cooking this week**, the filters, the add box, the lines (**item · qty · price**,
 * one line each), **Send all to cart**, then In cart. **Nothing King Soopers sits below
 * In cart.** Send goes in as a best guess, at once, with no review and no confirm
 * (`useCart`, `Cart.tsx`, TEC-206, TEC-211).
 *
 * **It leaves three ways**: a block of text you copy, a King Soopers search you
 * tap, or **Send to cart** — the no-OAuth rule was reversed for King Soopers on
 * 2026-09-26 (TEC-90). No gate exception for the list. Each line carries a
 * quantity for the cart, default 1.
 *
 * Local patterns: the status dot, the menu strip's chips and the
 * Pickup/Delivery segmented switch. They reuse the theme's tokens only.
 */
export default function List({
  refreshKey,
  onBrandsChanged,
  onOpenLines,
  recipeNames,
}: {
  refreshKey: number;
  onBrandsChanged?: () => void;
  /** The open (unticked) lines, or null until read, for the Deals tab's On my list (TEC-132). */
  onOpenLines?: (lines: string[] | null) => void;
  /** Recipe names by id, from the book, for Cooking this week. */
  recipeNames?: Map<string, string>;
}) {
  const [items, setItems] = useState<ShoppingLine[] | null>(null);
  // The read only; everything else is a toast. Same split as the book.
  const [readError, setReadError] = useState<string | null>(null);
  const toast = useToast();
  // **One "Are you sure?" with a count, never a list** (TEC-206). Section buttons use
  // `confirm`; a row's Remove uses `removeConfirm`. **Adds never ask** (TEC-211).
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "adding" | "tidying">(null);
  const [copied, setCopied] = useState(false);
  const [reloads, setReloads] = useState(0);
  // Prices come with the list, from the nightly check (TEC-190).
  const [priceStore, setPriceStore] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [dealError, setDealError] = useState<string | null>(null);
  // **Best** (TEC-196): only the List lines at, or within 5% of, their 12-week low.
  const [bestOnly, setBestOnly] = useState(false);
  // The add box looks like one line and grows to show a pasted list before Add.
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [typed]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/grocery", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the list.");
      setItems(body.items as ShoppingLine[]);
      setPriceStore((body.store as string | null) ?? null);
      setPriceError((body.priceError as string | null) ?? null);
      setDealError((body.dealError as string | null) ?? null);
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

  // The Deals tab matches these; the list is read once, here, and handed up.
  useEffect(() => {
    onOpenLines?.(items === null ? null : items.filter((i) => !i.checked && i.sent_at === null).map((i) => i.name));
  }, [items, onOpenLines]);

  // A refresh or a send changes Your brands, which is its own tab since
  // TEC-131; the tab is told so it reads again. A send changes what is sent here.
  const cart = useCart({
    onBrandsChanged: () => onBrandsChanged?.(),
    onListChanged: () => setReloads((n) => n + 1),
  });

  async function add() {
    // **One item per line** (owner, 2026-10-23: "Keep multi-line paste").
    const lines = typedLines(typed);
    if (lines.length === 0 || busy) return;
    setBusy("adding");
    try {
      const response = await fetch("/api/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't add that.");
      setTyped("");
      await load();
      // The one picker that stays: several saved products and no default opens a choice (TEC-206).
      void cart.offerChoices(((body.items ?? []) as { id: string }[]).map((i) => i.id));
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
    // The List only (TEC-190): a line in the cart is taken back first, never just deleted.
    const all = (items ?? []).filter((i) => i.sent_at === null).map((i) => i.id);
    if (all.length === 0) return;
    try {
      const response = await fetch("/api/grocery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: all }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't clear the list.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't clear the list.");
    }
  }

  async function clearBought() {
    const bought = (items ?? []).filter((i) => i.checked && i.sent_at === null).map((i) => i.id);
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

  /**
   * **Tidy applies at once** (TEC-206), after the one confirm: nothing to read first.
   * The route still checks the model's answer (`validateTidy`) before it is applied and
   * again as it is, so a tidy that would drop or double a line is refused, not shown.
   */
  async function tidyNow() {
    if (busy) return;
    setBusy("tidying");
    try {
      const response = await fetch("/api/grocery/tidy", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't work out a tidier list.");
      const lines = body.lines as TidyLine[];
      const applied = await fetch("/api/grocery/tidy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const result = await applied.json();
      if (!applied.ok) throw new Error(result.error ?? "Couldn't apply that.");
      toast.notice(`Tidied to ${lines.length} line${lines.length === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't tidy the list.");
    } finally {
      setBusy(null);
    }
  }

  async function copyList() {
    const text = asText((items ?? []).filter((i) => i.sent_at === null));
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

  // **Two sections** (TEC-190): List is what is still to send; In cart is what Cookbook
  // put in the King Soopers cart. Since TEC-206 that is the whole cart, because every add
  // comes from this app. A line is in one or the other, never both.
  const all = items ?? [];
  const onList = all.filter((i) => i.sent_at === null);
  const inCart = all.filter((i) => i.sent_at !== null);
  const open = onList.filter((i) => !i.checked);
  const bought = onList.filter((i) => i.checked);
  // **Best** (TEC-196): the List lines at, or within 5% of, their 12-week nightly low.
  // The server decided it (`lib/bestPrice.ts`, the Deals board's function); this only filters.
  const shownLines = bestOnly ? onList.filter((i) => i.deal?.best) : onList;
  // **Ticked lines go to the bottom** (TEC-206), here as well as on a reload, so ticking moves the line at once.
  const ordered = tickedLast(shownLines);

  const status = cart.status;
  // **Totals are summed from the nightly check**, per section, never $0 (TEC-190).
  const listTotals = totalsOf(open.map((i) => i.price));
  const everything = totalsOf([...open, ...inCart].map((i) => i.price));
  const nightWords =
    everything.from === null ? null : everything.from === everything.to ? shortDay(everything.from) : `${shortDay(everything.from)} to ${shortDay(everything.to as string)}`;
  const canAdd = cart.ready && cart.busy === null;
  const check = cart.cartCheck;
  const checkById = new Map((check?.lines ?? []).map((l) => [l.id, l]));
  // **The live In cart total** (TEC-206): today's price at the store, read by Refresh cart. Never $0.
  const cartTotalWords = !check
    ? null
    : inCart.length === 0
      ? null
      : check.total === null
        ? "In cart: no price"
        : `In cart ${money(check.total)}${check.unpriced > 0 ? ` · ${check.unpriced} no price` : ""}`;
  const storeLine = status?.connected && status.store;

  /** A section's "Are you sure?": the count, Cancel and the button. No list. */
  const sure = (kind: ConfirmKind, count: number, run: () => void, tone: "danger" | "accent" = "danger") => {
    const words = confirmWords(kind, count);
    return (
      <div role="group" aria-label="Are you sure?" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px]">
        <span className="min-w-0 flex-1 font-semibold">{words.ask}</span>
        <button type="button" onClick={() => setConfirm(null)} className="min-h-9 rounded-lg border border-line px-3 text-ink-soft">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirm(null);
            run();
          }}
          className={`min-h-9 rounded-lg px-3 font-bold ${tone === "danger" ? "border border-danger text-danger" : "bg-accent text-accent-ink"}`}
        >
          {words.yes}
        </button>
      </div>
    );
  };

  return (
    <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
      <ProductSplash cart={cart} />

      {/* The header: the counts, the live cart total, and King Soopers (TEC-211): the live status, Pickup/Delivery, the store. */}
      <div className="flex flex-col gap-2 px-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-bold">Grocery list</h2>
          <p className="text-[13px] text-ink-soft">
            {items !== null ? `${open.length} still to buy · ${inCart.length} in cart` : "Reading…"}
            {nightWords ? ` · prices from the night of ${nightWords}` : ""}
          </p>
          {cartTotalWords && check ? (
            <p className="text-[15px] font-bold">
              {cartTotalWords}
              <span className="text-[13px] font-normal text-ink-soft"> · checked {clock(check.checkedAt)}</span>
            </p>
          ) : null}
          {cart.cartCheckError ? (
            <p role="alert" className="text-xs text-danger">
              {cart.cartCheckError} In cart prices stay as they were until Refresh cart works.
            </p>
          ) : null}
          {priceError ? (
            <p role="alert" className="text-xs text-danger">
              {priceError} Lines read “no price yet” until it can.
            </p>
          ) : null}
          {dealError ? (
            <p role="alert" className="text-xs text-danger">
              {dealError} Lines stay plain, with no sale bubble or Best, until it can.
            </p>
          ) : null}
        </div>

        {/* ---- King Soopers: one status, always visible; tap it to check again ---- */}
        <KingSoopersStatus cart={cart} />
        {storeLine && status ? (
          <div className="flex items-center gap-2">
            <ModeSwitch value={status.modality} onChange={(m) => void cart.chooseModality(m)} disabled={cart.busy === "send" || cart.busy === "take-back"} />
            <button
              type="button"
              onClick={() => cart.setChoosingStore(!cart.choosingStore)}
              aria-expanded={cart.choosingStore}
              aria-label={`Store: ${status.store?.name}. Change store`}
              className="min-h-9 min-w-0 flex-1 truncate rounded-[10px] bg-raised px-3 text-left text-xs"
            >
              {status.store?.name} <span className="text-accent">· change</span>
            </button>
            <button type="button" onClick={() => void cart.disconnect()} disabled={cart.busy !== null} className="shrink-0 text-xs text-ink-soft underline decoration-dotted underline-offset-2 disabled:opacity-50">
              disconnect
            </button>
          </div>
        ) : null}
        {status?.configured && status.connected && !status.store ? (
          <div className="rounded-xl bg-surface p-3">
            <StorePicker cart={cart} />
          </div>
        ) : null}
        {cart.choosingStore ? (
          <div className="rounded-xl bg-surface p-3">
            <StorePicker cart={cart} />
          </div>
        ) : null}
        {cart.scanNote?.failed ? (
          <p role="alert" className="text-xs text-danger">
            {cart.scanNote.text}
          </p>
        ) : null}
      </div>

      {/* **The refresh log is collapsed** (TEC-190): one summary line, the detail on a tap. */}
      <RefreshLog cart={cart} />

      <CookingThisWeek refreshKey={refreshKey} recipeNames={recipeNames} />

      {/* ---- List ---- */}
      <section aria-label="List" className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 px-2">
          <h3 className="text-lg font-bold">List · {open.length}</h3>
          <span className="text-right text-[13px] text-ink-soft">{totalWords(listTotals, open.length)}</span>
        </div>
        {confirm === "tidy" || confirm === "clear-ticked" || confirm === "clear-all" ? (
          confirm === "tidy" ? (
            sure("tidy", open.length, () => void tidyNow(), "accent")
          ) : confirm === "clear-ticked" ? (
            sure("clear-ticked", bought.length, () => void clearBought())
          ) : (
            sure("clear-all", onList.length, () => void clearEverything())
          )
        ) : (
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-2">
            {/* **Best** (TEC-196): only the lines at, or within 5% of, their 12-week low. */}
            <button
              type="button"
              aria-pressed={bestOnly}
              onClick={() => setBestOnly((b) => !b)}
              className={`rounded-full px-2.5 py-0.5 text-[13px] ${bestOnly ? "bg-accent font-semibold text-accent-ink" : "border border-line text-accent"}`}
            >
              Best{bestOnly ? ` · ${shownLines.length}` : ""}
            </button>
            <button type="button" onClick={copyList} disabled={open.length === 0} className={LINK}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => setConfirm("tidy")} disabled={open.length < 2 || busy !== null} className={LINK}>
              {busy === "tidying" ? "Tidying…" : "Tidy"}
            </button>
            <button type="button" onClick={() => setConfirm("clear-ticked")} disabled={bought.length === 0} className={LINK}>
              Clear ticked
            </button>
            <button type="button" onClick={() => setConfirm("clear-all")} disabled={onList.length === 0} className={LINK}>
              Clear all
            </button>
          </div>
        )}

        {/* **Adding sits below the filters** (TEC-206; it was at the top from 2026-09-22). */}
        <div className="flex gap-2">
          {/* One line to look at; a paste of several lines shows them all, one
              item each. Enter adds; Shift+Enter starts another line. */}
          <textarea
            ref={box}
            rows={1}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="Add an item — notes after a dash"
            aria-label="Add items, one per line"
            className="min-h-11 min-w-0 flex-1 resize-none overflow-hidden rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base leading-snug"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={typed.trim() === "" || busy !== null}
            className="min-h-11 self-start rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy === "adding" ? "Adding…" : typedLines(typed).length > 1 ? `Add ${typedLines(typed).length}` : "Add"}
          </button>
        </div>

        {items === null ? (
          readError ? (
            <p role="alert" className="px-2 text-sm text-danger">
              {readError}
            </p>
          ) : (
            <p className="px-2 text-sm text-ink-soft">Reading the list…</p>
          )
        ) : onList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
            {inCart.length > 0
              ? "Nothing left on the List. Everything is in the cart."
              : "Nothing on it. Add a recipe’s ingredients from the book, or type what you need."}
          </p>
        ) : shownLines.length === 0 ? (
          // **An empty Best says why** (TEC-196), as an empty Deals filter does.
          <div role="status" className="flex flex-col gap-1 rounded-xl border border-dashed border-line p-3.5">
            <span className="text-[15px] font-bold">{bestEmptyWords(onList.map((i) => i.deal)).title}</span>
            <span className="text-[13px] text-ink-soft">{bestEmptyWords(onList.map((i) => i.deal)).body}</span>
            <button type="button" onClick={() => setBestOnly(false)} className="mt-1 min-h-11 self-start rounded-xl border border-accent px-3.5 font-bold text-accent">
              Show the whole List
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ordered.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                onTick={() => void tick(item)}
                onQuantity={(q) => void setQuantity(item, q)}
                canAdd={canAdd}
                adding={cart.adding === item.id}
                notSent={cart.notSent.get(item.id) ?? null}
                onAdd={() => void cart.addOne(item.id)}
              />
            ))}
          </ul>
        )}
        {/* **Send all** (TEC-206, TEC-211): no confirm. One tap, and every line goes in as its best guess. */}
        {cart.ready ? (
          <button
            type="button"
            onClick={() => void cart.sendAll()}
            disabled={cart.busy !== null || open.length === 0}
            className="min-h-11 rounded-[10px] border border-accent bg-transparent text-[15px] font-bold text-accent disabled:opacity-50"
          >
            {cart.busy === "send" ? "Sending…" : "Send all to cart"}
          </button>
        ) : null}
      </section>

      {/* ---- In cart ---- */}
      {cart.ready || inCart.length > 0 ? (
        <section aria-label="In cart" className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 px-2">
            <h3 className="text-lg font-bold">In cart · {inCart.length}</h3>
            <span className="flex items-baseline gap-3 text-right text-[13px] text-ink-soft">
              {cartTotalWords && check ? cartTotalWords.replace("In cart ", "") : ""}
              {cart.ready ? (
                <button type="button" onClick={() => void cart.refreshCart()} disabled={cart.busy !== null} className={LINK}>
                  {cart.busy === "cart-check" ? "Checking…" : "Refresh cart"}
                </button>
              ) : null}
            </span>
          </div>
          {inCart.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">Nothing in the cart.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {inCart.map((item) => {
                const live = checkById.get(item.id);
                return (
                  <InCartRow
                    key={item.id}
                    item={item}
                    live={live ? { total: live.total } : null}
                    disabled={cart.busy !== null}
                    removing={cart.removing === item.id}
                    confirming={removeConfirm === item.id}
                    onAskRemove={() => setRemoveConfirm(item.id)}
                    onCancel={() => setRemoveConfirm(null)}
                    onRemove={() => {
                      setRemoveConfirm(null);
                      void cart.removeOne(item.id);
                    }}
                  />
                );
              })}
            </ul>
          )}

          {cart.takeBackResults ? <TakeBackResults results={cart.takeBackResults} onClose={cart.dismissTakeBack} /> : null}

          {/* **Clear cart clears every line in In cart whatever King Soopers answers** (TEC-206, TEC-210): one confirm with the count, no list, shown even when not signed in. */}
          {cart.ready || inCart.length > 0 ? (
            confirm === "clear-cart" ? (
              sure("clear-cart", inCart.length, () => void cart.clearCart())
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm("clear-cart")}
                  disabled={cart.busy !== null || inCart.length === 0}
                  className="min-h-11 flex-1 rounded-[10px] border border-danger bg-transparent text-[15px] font-bold text-danger disabled:opacity-50"
                >
                  {cart.busy === "take-back" && !cart.removing ? "Clearing…" : "Clear cart"}
                </button>
                <a
                  href={CHECKOUT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-raised text-[15px]"
                >
                  Go to checkout
                </a>
              </div>
            )
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

/**
 * **The live King Soopers status** (TEC-211), always visible in the header: a dot, the
 * state in words (colour is never the only cue), and what follows. Tapping it checks
 * again. Beside it, Reconnect or Connect where that is the way out, and **Refresh now**
 * (the price refresh) once connected with a store. "Not set up" says which variable is missing.
 */
function KingSoopersStatus({ cart }: { cart: ReturnType<typeof useCart> }) {
  const { status } = cart;
  if (status === null && cart.statusError && !cart.check) {
    return (
      <p role="alert" className="text-xs text-danger">
        {cart.statusError}
      </p>
    );
  }
  const line = checkLine(cart.check, cart.lastWorked);
  const checking = cart.check === null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void cart.runCheck()}
          disabled={checking}
          aria-label={`King Soopers: ${line.word}${line.rest ? `, ${line.rest}` : ""}. Tap to check again`}
          title={cart.check?.detail ?? "Tap to check King Soopers again"}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left text-[13px]"
        >
          <span aria-hidden="true" className={TONE[line.tone]}>
            ●
          </span>
          <span role="status" className={`shrink-0 font-semibold ${TONE[line.tone]}`}>
            {line.word}
          </span>
          {line.rest ? <span className="min-w-0 truncate text-ink-soft">· {line.rest}</span> : null}
        </button>
        {line.action ? (
          <a href={line.action.href} className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-accent underline-offset-2 hover:underline">
            {line.action.label}
          </a>
        ) : null}
        {status?.configured && status.connected && status.store ? (
          <button
            type="button"
            onClick={() => void cart.refresh()}
            disabled={cart.refreshing}
            title={status.refreshedAt ? `Prices checked ${when(status.refreshedAt)}` : "Prices not checked yet"}
            className="min-h-9 shrink-0 whitespace-nowrap rounded-lg border border-line px-2.5 text-xs disabled:opacity-50"
          >
            {cart.refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        ) : null}
      </div>
      {cart.check?.state === "not-set-up" && cart.check.problems.length > 0 ? (
        <p className="text-xs text-ink-soft">Send to cart isn&rsquo;t set up on this deployment: {cart.check.problems.join("; ")}.</p>
      ) : null}
    </div>
  );
}

/**
 * One List line: **item · qty · price** and nothing else (TEC-211; owner, 2026-11-02:
 * "On the shopping list I just want to see item qty and price"). The tick, the name (the
 * link: your remembered product or a search, as the server resolved it), the ×N box, the
 * price, and **+ Cart**, which are controls, not text. **The tick is its own tap target**,
 * so ticking in the shop never opens King Soopers (TEC-39).
 *
 * **One line per item** (TEC-196): the name truncates with an ellipsis and the full text is
 * the row's `title`; the box, price and button never shrink. **Shaded by deal**, and what
 * says why rides on the price's `title` and accessible name. **A ticked line is faded**
 * (TEC-206). **+ Cart goes at once** (TEC-211). A line a send did not take reads a red
 * "not sent" in its price spot until the next send.
 */
export function ListRow(props: {
  item: ShoppingLine;
  onTick: () => void;
  onQuantity: (q: number) => void;
  canAdd: boolean;
  adding: boolean;
  notSent: string | null;
  onAdd: () => void;
}) {
  const { item } = props;
  // A ticked line is done: no shade, no bubble.
  const deal = item.checked ? null : item.deal;
  const name = item.view?.name ?? item.name;
  return (
    <li
      title={[name, dealWords(deal)].filter(Boolean).join(" · ")}
      className={`flex items-center gap-2 rounded-[10px] bg-surface py-2 pl-2 pr-2.5 ${SHADE_CLASS[deal?.shade ?? "plain"]} ${item.checked ? "opacity-60" : ""}`}
    >
      <label className="flex shrink-0 cursor-pointer items-center self-stretch">
        <input type="checkbox" checked={item.checked} onChange={props.onTick} aria-label={`Got ${item.name}`} className="size-6 accent-accent" />
      </label>
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={`block min-w-0 flex-1 truncate text-[15px] font-semibold ${item.checked ? "text-ink-soft line-through" : ""}`}
      >
        {name}
      </a>
      <Quantity key={`${item.id}:${item.quantity}`} item={item} onCommit={props.onQuantity} />
      <Price price={item.price} cue={dealWords(deal)} notSent={props.notSent} />
      {props.canAdd && !item.checked ? (
        <button
          type="button"
          aria-label="Add to cart"
          onClick={props.onAdd}
          disabled={props.adding}
          className="h-8 shrink-0 whitespace-nowrap rounded-lg bg-accent px-2.5 text-xs font-bold text-accent-ink disabled:opacity-50"
        >
          {props.adding ? "…" : "+ Cart"}
        </button>
      ) : null}
    </li>
  );
}

/**
 * A line's price from the nightly check, or "no price yet": never $0. `cue` is what says
 * why the line is shaded (a sale, a coupon, a good or high price), for the `title` and the
 * accessible name. `notSent` replaces the price with a red "not sent" (TEC-211), with the
 * reason in its `title`.
 */
function Price({ price, cue, notSent }: { price: LinePrice | null | undefined; cue?: string | null; notSent?: string | null }) {
  if (notSent) {
    return (
      <span role="status" title={notSent} className="min-w-14 whitespace-nowrap text-right text-[11px] font-bold text-danger">
        not sent
      </span>
    );
  }
  return price ? (
    <span
      className="min-w-14 whitespace-nowrap text-right text-[13px] tabular-nums"
      title={[price.onSale ? "On sale in the last nightly check" : null, cue].filter(Boolean).join(" · ") || undefined}
      aria-label={cue ? `${money(price.total)}, ${cue}` : undefined}
    >
      {money(price.total)}
    </span>
  ) : (
    <span className="min-w-14 whitespace-nowrap text-right text-[11px] text-ink-soft">no price yet</span>
  );
}

/**
 * One In cart line: **item · qty · price** and **Remove** (TEC-211). The price is today's
 * once Refresh cart has read it, else the nightly check's; "no price" when Kroger can't
 * price it, never $0. The ×N box is the quantity that was sent, so it does not edit.
 * **Remove** is Take back for this line, after one "Take 1 out of the cart?".
 */
export function InCartRow(props: {
  item: ShoppingLine;
  live: { total: number | null } | null;
  disabled: boolean;
  removing: boolean;
  confirming: boolean;
  onAskRemove: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const { item } = props;
  const name = item.view?.name ?? item.name;
  const ask = confirmWords("remove", 1);
  return (
    <li title={[name, dealWords(item.deal)].filter(Boolean).join(" · ")} className={`flex items-center gap-2 rounded-[10px] bg-raised py-2 pl-3 pr-2.5 ${SHADE_CLASS[item.deal?.shade ?? "plain"]}`}>
      <a href={item.href} target="_blank" rel="noreferrer" className="block min-w-0 flex-1 truncate text-[15px] font-semibold">
        {name}
      </a>
      <span className="flex shrink-0 items-center rounded-lg border border-line bg-surface px-2 py-1 text-sm font-semibold" aria-label={`${item.quantity} in the cart`}>
        ×{item.quantity}
      </span>
      {props.live ? (
        props.live.total === null ? (
          <span className="min-w-14 whitespace-nowrap text-right text-[11px] text-ink-soft">no price</span>
        ) : (
          <span className="min-w-14 whitespace-nowrap text-right text-[13px] tabular-nums">{money(props.live.total)}</span>
        )
      ) : (
        <Price price={item.price} cue={dealWords(item.deal)} />
      )}
      {props.confirming ? (
        <span role="group" aria-label="Are you sure?" className="flex shrink-0 flex-col items-stretch gap-1">
          <span className="text-center text-[11px] font-semibold">{ask.ask}</span>
          <span className="flex gap-1">
            <button type="button" onClick={props.onCancel} className="h-8 rounded-lg border border-line px-2 text-xs text-ink-soft">
              No
            </button>
            <button type="button" onClick={props.onRemove} className="h-8 rounded-lg border border-danger px-2.5 text-xs font-bold text-danger">
              {ask.yes}
            </button>
          </span>
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Remove ${name} from the cart`}
          onClick={props.onAskRemove}
          disabled={props.disabled}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-[10px] border border-line bg-transparent px-3 text-[13px] disabled:opacity-50"
        >
          {props.removing ? "Removing…" : "Remove"}
        </button>
      )}
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
