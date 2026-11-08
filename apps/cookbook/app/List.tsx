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
import { bestEmptyWords, bubbleText, priceTag, shadeWord, type LineDeal } from "@/lib/lineDeal";
import type { Shade } from "@/lib/dealSignal";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { repriced, totalsOf, type LinePrice, type Totals } from "@/lib/listPrices";
import { shortDay } from "@/lib/dealFilter";
import { checkLine, clock } from "@/lib/checkLine";
import type { PickedProduct } from "@/lib/linePick";
import { cartSplit, greyTotal, greyWords, productWords, type MirrorRow } from "@/lib/mirrorWords";
import { ItemMatches } from "./ItemMatches";
import { ProductSplash, RefreshLog, StorePicker, useCart, when } from "./Cart";
import { useMirror } from "./useMirror";
import { FIELD_CONTROL, SearchField } from "./SearchField";
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
    /** For an In cart line, the product that was sent, from the ledger and Your brands (TEC-227). */
    used?: { product: string; size: string | null } | null;
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
 * accent for good and the danger colour for bad, as a faint wash over the row's own
 * ground. **The 4px left bar is gone** (TEC-236: the owner could not tell what it meant);
 * a small tag beside the price says it in a word (`PriceTagPill`). Colour is never the only
 * cue: the tag, the bubble or "Good price" / "High price" says why. The wash is 8%, where
 * `tests/dealShade.test.ts` holds every text colour on it at 4.5:1 in light and dark.
 */
const SHADE_CLASS: Record<Shade, string> = {
  plain: "",
  good: "bg-gradient-to-r from-accent/[0.08] to-accent/[0.08]",
  bad: "bg-gradient-to-r from-danger/[0.08] to-danger/[0.08]",
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
  // `confirm`. **Adds never ask** (TEC-211), and neither does Back to list (TEC-228).
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  // The line whose matches popup is open (TEC-226).
  const [looking, setLooking] = useState<ShoppingLine | null>(null);
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
    // **The price follows the quantity at once** (TEC-236): the unit price is the night's, so the total
    // is worked out here, and the row and the section totals move with no reload.
    setItems((current) => (current ?? []).map((i) => (i.id === item.id ? { ...i, quantity, price: repriced(i.price, quantity) } : i)));
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

  /**
   * **Pick a product for this line** (TEC-227; owner: "This line only"), or clear the pick with null.
   * The popup closes, the row changes at once, and a refused write reloads the truth. It never sets a
   * default: the server writes the line's own column and nothing else.
   */
  async function pick(item: ShoppingLine, picked: PickedProduct | null) {
    setLooking(null);
    setItems((current) => (current ?? []).map((i) => (i.id === item.id ? { ...i, picked } : i)));
    const word = item.view?.name ?? item.name;
    try {
      const response = await fetch("/api/grocery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, pick: picked }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Couldn't save that pick.");
      toast.notice(picked ? `${word}: ${productWords(picked.label, picked.size)}.` : `${word} goes back to the automatic pick.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that pick.");
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
  // **In cart counts and totals only the live rows** (TEC-227): the grey mirror rows are not in the cart.
  const inCart = cartSplit(all).live;
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
  // **The grey rows In cart** (TEC-227): each unsent, unticked List line as the product a send would put in
  // the cart now. They are not in the cart, so no count or total below includes them.
  const mirrorOf = useMirror(items, { enabled: cart.ready, refreshKey, reloads });
  const greyed = cart.ready ? cartSplit(all).grey : [];
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
  // The checkout bar's total: the live In cart total once Refresh cart has read it, else summed from the nightly check.
  const checkoutTotal = inCart.length === 0 ? null : (check?.total ?? totalsOf(inCart.map((i) => i.price)).total);

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
          className={`min-h-9 rounded-lg px-3 font-bold ${tone === "danger" ? "border border-danger text-danger" : "lift bg-accent text-accent-ink"}`}
        >
          {words.yes}
        </button>
      </div>
    );
  };

  return (
    <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
      <ProductSplash cart={cart} />
      {looking ? (
        <ItemMatches
          key={looking.id}
          id={looking.id}
          name={looking.view?.name ?? looking.name}
          fallback={looking.href}
          onPick={(picked) => void pick(looking, picked)}
          onClose={() => setLooking(null)}
        />
      ) : null}

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

        {/* **Adding sits below the filters** (TEC-206; it was at the top from 2026-09-22). TEC-236 (the
            owner's demo): one rounded field with a plus inside and a green ring on focus, in place
            of TEC-212's bordered card. Add stays a solid accent button at its end, whether or not
            there is text: with none it does nothing (`add` returns), and is never faded. */}
        <SearchField icon="add" label="Add to the list">
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
            placeholder="Eggs, 2 lb chicken — notes after a dash"
            aria-label="Add items, one per line"
            className={`${FIELD_CONTROL} resize-none overflow-hidden py-2.5`}
          />
          <button
            type="button"
            onClick={() => void add()}
            aria-disabled={typed.trim() === "" || busy !== null}
            className="lift min-h-10 shrink-0 self-start whitespace-nowrap rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink"
          >
            {busy === "adding" ? "Adding…" : typedLines(typed).length > 1 ? `Add ${typedLines(typed).length}` : "Add"}
          </button>
        </SearchField>

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
                onOpen={() => setLooking(item)}
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
            className="min-h-11 rounded-[10px] border-2 border-accent bg-surface text-[15px] font-bold text-accent shadow-sm disabled:opacity-50"
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
          {/* No "Nothing in the cart" box (TEC-236): an empty cart shows no live rows. */}
          {inCart.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {inCart.map((item) => {
                const live = checkById.get(item.id);
                return (
                  <InCartRow
                    key={item.id}
                    item={item}
                    live={live ? { total: live.total } : null}
                    disabled={cart.busy !== null}
                    returning={cart.returning === item.id}
                    onBack={() => void cart.backToList(item.id)}
                  />
                );
              })}
            </ul>
          ) : null}
          {/* **Grey mirror rows** (TEC-227): what each unsent List line would send now. + Cart or Send all turns one live. */}
          {greyed.length > 0 ? (
            <>
              {/* **Says what the faded rows are** (TEC-236; replaces the "Nothing in the cart" box). */}
              <p role="note" className="flex items-start gap-2 rounded-[10px] bg-accent/10 px-2.5 py-2 text-xs leading-snug text-ink-soft">
                <span aria-hidden="true">ⓘ</span>
                <span>
                  <b className="text-ink">Faded rows are your List, matched to King Soopers products.</b> They become live when you add them to the cart.
                </span>
              </p>
              <ul aria-label="Not sent yet" className="flex flex-col gap-1.5">
                {greyed.map((item) => (
                  <GreyRow key={item.id} item={item} row={mirrorOf(item)} />
                ))}
              </ul>
            </>
          ) : null}

          {/* **Clear cart clears every line in In cart in Cookbook only; King Soopers is not asked** (TEC-206, TEC-210, TEC-228): one confirm with the count, no list, shown even when not signed in. */}
          {cart.ready || inCart.length > 0 ? (
            <>
              {/* **Go to checkout is the full-width green bar, with the cart total** (TEC-236). The total is the
                  live In cart total once Refresh cart has read it, else the nightly sum; never $0. */}
              <a
                href={CHECKOUT_URL}
                target="_blank"
                rel="noreferrer"
                className="lift flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-accent px-4 py-3 text-[15px] font-bold text-accent-ink"
              >
                <span>Go to checkout →</span>
                {checkoutTotal !== null ? <span className="tabular-nums">{money(checkoutTotal)}</span> : null}
              </a>
              {confirm === "clear-cart" ? (
                sure("clear-cart", inCart.length, () => void cart.clearCart())
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm("clear-cart")}
                  disabled={cart.busy !== null || inCart.length === 0}
                  className="min-h-11 rounded-[10px] border-2 border-danger bg-surface text-[15px] font-bold text-danger shadow-sm disabled:opacity-50"
                >
                  {cart.busy === "take-back" && !cart.returning ? "Clearing…" : "Clear cart"}
                </button>
              )}
            </>
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
  onOpen: () => void;
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
      <button
        type="button"
        onClick={props.onOpen}
        aria-haspopup="dialog"
        className={`block min-w-0 flex-1 truncate text-[15px] font-semibold text-left ${item.checked ? "text-ink-soft line-through" : ""}`}
      >
        {name}
      </button>
      <Quantity key={`${item.id}:${item.quantity}`} item={item} onCommit={props.onQuantity} />
      <PriceTagPill deal={deal} hide={!!props.notSent} />
      <Price price={item.price} cue={dealWords(deal)} notSent={props.notSent} />
      {props.canAdd && !item.checked ? (
        <button
          type="button"
          aria-label="Add to cart"
          onClick={props.onAdd}
          disabled={props.adding}
          className="lift h-7 shrink-0 whitespace-nowrap rounded-full bg-accent px-2.5 text-[11px] font-bold text-accent-ink disabled:opacity-50"
        >
          {props.adding ? "…" : "+ Cart"}
        </button>
      ) : null}
    </li>
  );
}

/**
 * **The Sale / Low / Coupon / High tag beside a price** (TEC-236, in place of the green left bar). A
 * small outlined word in the accent (good) or the danger colour (bad), the same pair the wash is
 * measured with. The long reason is on the price's `title` and accessible name, so the tag is
 * `aria-hidden` rather than read twice. A local pattern; tokens only.
 */
function PriceTagPill({ deal, hide }: { deal: LineDeal | null | undefined; hide?: boolean }) {
  const tag = hide ? null : priceTag(deal);
  if (!tag) return null;
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide ${
        tag.tone === "bad" ? "border-danger text-danger" : "border-accent text-accent"
      }`}
    >
      {tag.word}
    </span>
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
 * One In cart line: **item · qty · price** and **Back to list** (TEC-228, was Remove). **The name is the
 * exact product that was sent**, "Coke Zero 12 oz", in place of the list word (TEC-227), read from the
 * ledger and Your brands; with no ledger row it falls back to the list word. **It is not tappable**:
 * an item in the cart can't be changed, so there is no popup here. The price is today's once Refresh
 * cart has read it, else the nightly check's; "no price" when Kroger can't price it, never $0. The ×N
 * box is the quantity that was sent, so it does not edit. **Back to list** returns this line to the
 * List unsent, with no confirm; King Soopers is not asked. The quantity and the price are one size.
 */
export function InCartRow(props: {
  item: ShoppingLine;
  live: { total: number | null } | null;
  disabled: boolean;
  returning: boolean;
  onBack: () => void;
}) {
  const { item } = props;
  const word = item.view?.name ?? item.name;
  const name = item.used ? productWords(item.used.product, item.used.size) : word;
  return (
    <li title={[name, dealWords(item.deal)].filter(Boolean).join(" · ")} className={`flex items-center gap-2 rounded-[10px] bg-raised py-2 pl-3 pr-2.5 ${SHADE_CLASS[item.deal?.shade ?? "plain"]}`}>
      <span className="block min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
      <span className="flex shrink-0 items-center rounded-full border border-line bg-surface px-1.5 py-0.5 text-[13px] font-semibold" aria-label={`${item.quantity} in the cart`}>
        ×{item.quantity}
      </span>
      {props.live ? (
        props.live.total === null ? (
          <span className="min-w-14 whitespace-nowrap text-right text-[11px] text-ink-soft">no price</span>
        ) : (
          <span className="min-w-14 whitespace-nowrap text-right text-[13px] tabular-nums">{money(props.live.total)}</span>
        )
      ) : (
        <>
          <PriceTagPill deal={item.deal} />
          <Price price={item.price} cue={dealWords(item.deal)} />
        </>
      )}
      <button
        type="button"
        aria-label={`Put ${name} back on the list`}
        onClick={props.onBack}
        disabled={props.disabled}
        className="h-7 shrink-0 whitespace-nowrap rounded-full border border-line bg-transparent px-2.5 text-[11px] disabled:opacity-50"
      >
        {props.returning ? "Moving…" : "Back to list"}
      </button>
    </li>
  );
}

/**
 * **A grey mirror row** (TEC-227; owner: "With the list conversion shopping list creates a mirror
 * grayed out item in cart. Adding it one off or the entire list switches them to live."). An unsent
 * List line, shown In cart as the exact product a send would put in the cart now ("Coke Zero 12 oz"),
 * by the same picking as a send. With no clear match it reads "coke — pick one"; if it could not be
 * worked out, or is still being, the plain word. Not tappable: tap the List row to pick. It shows its
 * price, but **it is not in the cart**, so the In cart count and total never include it; + Cart or
 * Send all makes it a live row. Grey is not the only cue: it says "Not sent yet" to a screen reader
 * and in its `title`.
 */
export function GreyRow({ item, row }: { item: ShoppingLine; row: MirrorRow | null }) {
  const word = item.view?.name ?? item.name;
  const words = greyWords(word, row);
  const total = greyTotal(row, item.quantity, item.price?.total ?? null);
  return (
    <li title={`${words} · not sent yet`} data-grey="" className="flex items-center gap-2 rounded-[10px] bg-raised py-2 pl-3 pr-2.5 opacity-60">
      <span className="block min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-soft">
        <span className="sr-only">Not sent yet: </span>
        {words}
      </span>
      <span className="flex shrink-0 items-center rounded-full border border-line bg-surface px-1.5 py-0.5 text-[13px] font-semibold" aria-label={`${item.quantity}, not sent yet`}>
        ×{item.quantity}
      </span>
      {total === null ? (
        <span className="min-w-14 whitespace-nowrap text-right text-[11px] text-ink-soft">no price yet</span>
      ) : (
        <span className="min-w-14 whitespace-nowrap text-right text-[13px] tabular-nums">{money(total)}</span>
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
    <label className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-raised px-1.5 py-0.5 text-[13px] font-semibold">
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
        className="w-5 bg-transparent text-center"
      />
    </label>
  );
}
