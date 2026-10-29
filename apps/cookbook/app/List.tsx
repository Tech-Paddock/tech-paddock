"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { typedLines } from "@/lib/typedLines";
import { MAX_QUANTITY, asText, type GroceryItem, type TidyLine } from "@/lib/grocery";
import type { ResolvedLink } from "@/lib/preferences";
import type { LineMark } from "@/lib/brands";
import type { MenuEntry } from "@/lib/menu";
import { menuDayLabel } from "@/lib/menuDay";
import { MODALITIES, modalityWord, type Modality } from "@/lib/modality";
import { saleTags, saleText, type SaleTag } from "@/lib/saleTag";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { totalsOf, type LinePrice, type Totals } from "@/lib/listPrices";
import { shortDay } from "@/lib/dealFilter";
import { CartPanel, RefreshLog, SendView, TakeBackConfirm, TakeBackResults, useCart } from "./Cart";
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
    /** This line's price from the nightly check, or null for "no price yet" (TEC-190; `lib/listPrices.ts`). */
    price?: LinePrice | null;
  };

const money = (n: number) => `$${n.toFixed(2)}`;

/** "about $21.46 · 1 no price yet", or "no price yet" when nothing is priced. Never $0. */
function totalWords(t: Totals, lines: number): string {
  if (lines === 0) return "";
  if (t.total === null) return "no price yet";
  return `about ${money(t.total)}${t.unpriced > 0 ? ` · ${t.unpriced} no price yet` : ""}`;
}

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
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "adding" | "tidying" | "applying">(null);
  const [proposal, setProposal] = useState<TidyLine[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloads, setReloads] = useState(0);
  // Prices come with the list, from the nightly check (TEC-190).
  const [priceStore, setPriceStore] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
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
      setConfirmingClear(false);
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
  // put in the King Soopers cart and has not taken back (`sent_at`, with the ledger
  // behind it). A line is in one or the other, never both.
  const all = items ?? [];
  const onList = all.filter((i) => i.sent_at === null);
  const inCart = all.filter((i) => i.sent_at !== null);
  const open = onList.filter((i) => !i.checked);
  const bought = onList.filter((i) => i.checked);
  // **On sale at the chosen store** (TEC-121 3a): the latest deal scan the cart
  // holds; no Kroger call per render. Open List lines only.
  const locationId = cart.status?.connected ? (cart.status.store?.locationId ?? null) : null;
  const onSale = useMemo(
    () => saleTags((items ?? []).filter((i) => i.sent_at === null && !i.checked), { locationId, scan: cart.latestScan }),
    [items, locationId, cart.latestScan]
  );

  // **The review replaces the list** (the mockup's Send to cart screen), with a way back.
  if (cart.review !== null) {
    return (
      <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
        <SendView cart={cart} />
      </section>
    );
  }

  const status = cart.status;
  // **Totals are summed from the nightly check**, per section, never $0 (TEC-190).
  const listTotals = totalsOf(open.map((i) => i.price));
  const cartTotals = totalsOf(inCart.map((i) => i.price));
  const everything = totalsOf([...open, ...inCart].map((i) => i.price));
  const nightWords =
    everything.from === null ? null : everything.from === everything.to ? shortDay(everything.from) : `${shortDay(everything.from)} to ${shortDay(everything.to as string)}`;
  const canAdd = cart.ready && cart.busy === null;

  return (
    <section id="shop" className="flex scroll-mt-4 flex-col gap-3">
      {/* The header: the counts, the store, where the prices are from, and Pickup/Delivery. */}
      <div className="flex items-end justify-between gap-3 px-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-bold">Grocery list</h2>
          <p className="text-[13px] text-ink-soft">
            {items !== null ? `${open.length} still to buy · ${inCart.length} in cart` : "Reading…"}
            {priceStore ? ` · ${priceStore}` : status?.store ? ` · ${status.store.name}` : ""}
            {nightWords ? ` · prices from the night of ${nightWords}` : ""}
          </p>
          {priceError ? (
            <p role="alert" className="text-xs text-danger">
              {priceError} Lines read “no price yet” until it can.
            </p>
          ) : null}
        </div>
        {cart.ready && status ? (
          <ModeSwitch value={status.modality} onChange={(m) => void cart.chooseModality(m)} disabled={cart.busy === "send" || cart.busy === "take-back"} />
        ) : null}
      </div>

      {/* **The refresh log is collapsed** (TEC-190): one summary line, the detail on a tap. */}
      <RefreshLog cart={cart} />

      {/* **Adding sits at the top** (2026-09-22): it is what you do most here. */}
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

      <CookingThisWeek refreshKey={refreshKey} recipeNames={recipeNames} />

      {/* ---- List ---- */}
      <section aria-label="List" className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 px-2">
          <h3 className="text-lg font-bold">List · {open.length}</h3>
          <span className="text-right text-[13px] text-ink-soft">{totalWords(listTotals, open.length)}</span>
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-2">
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
                Clear all {onList.length} — sure?
              </button>
              <button type="button" onClick={() => setConfirmingClear(false)} className={LINK}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmingClear(true)} disabled={onList.length === 0} className={LINK}>
              Clear all
            </button>
          )}
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
        ) : onList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
            {inCart.length > 0
              ? "Nothing left on the List. Everything is in the cart."
              : "Nothing on it. Add a recipe’s ingredients from the book, or type what you need."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {onList.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                sale={onSale.get(item.id) ?? null}
                onTick={() => void tick(item)}
                onQuantity={(q) => void setQuantity(item, q)}
                canAdd={canAdd}
                adding={cart.adding === item.id}
                onAdd={() => void cart.addOne(item.id)}
              />
            ))}
          </ul>
        )}
        <p className="px-2 text-xs text-ink-soft">★ default saved · ? needs a pick at Send · + not saved yet</p>
        {/* **Send all stays** (owner): the whole List through Going in, Pick one and Not saved yet. */}
        {cart.ready ? (
          <button
            type="button"
            onClick={() => void cart.startReview()}
            disabled={cart.busy !== null || open.length === 0}
            className="min-h-11 rounded-[10px] border border-accent bg-transparent text-[15px] font-bold text-accent disabled:opacity-50"
          >
            {cart.busy === "review" ? "Looking up…" : "Send all to cart"}
          </button>
        ) : null}
      </section>

      {/* ---- In cart ---- */}
      {cart.ready || inCart.length > 0 ? (
        <section aria-label="In cart" className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 px-2">
            <h3 className="text-lg font-bold">In cart · {inCart.length}</h3>
            <span className="text-right text-[13px] text-ink-soft">{totalWords(cartTotals, inCart.length)}</span>
          </div>
          {inCart.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">Nothing Cookbook has put in the cart.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {inCart.map((item) => (
                <InCartRow
                  key={item.id}
                  item={item}
                  disabled={cart.busy !== null}
                  removing={cart.removing === item.id}
                  onRemove={() => void cart.removeOne(item.id)}
                />
              ))}
            </ul>
          )}

          {cart.takeBackPreview ? (
            <TakeBackConfirm
              lines={cart.takeBackPreview}
              working={cart.busy === "take-back"}
              onConfirm={() => void cart.confirmTakeBack()}
              onCancel={() => cart.setTakeBackPreview(null)}
            />
          ) : null}
          {cart.takeBackResults ? <TakeBackResults results={cart.takeBackResults} /> : null}

          {/* **Clear cart is Take back** (RULES.md): its two taps and its "anything added elsewhere stays". */}
          {cart.ready ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void cart.lookTakeBack()}
                disabled={cart.busy !== null || cart.takeBackPreview !== null || inCart.length === 0}
                className="min-h-11 flex-1 rounded-[10px] border border-danger bg-transparent text-[15px] font-bold text-danger disabled:opacity-50"
              >
                {cart.busy === "take-back-look" ? "Checking…" : "Clear cart"}
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
          ) : null}
          {/* **The API cannot read the account**, so this is only what Cookbook sent (RULES.md). */}
          <p className="px-2 text-xs text-ink-soft">
            Shows what Cookbook put in your King Soopers cart. Anything you added in the King Soopers app stays there and isn&rsquo;t shown.
          </p>
        </section>
      ) : null}

      {/* Send to cart, King Soopers (TEC-90): connection, store and refresh. */}
      <CartPanel cart={cart} />
    </section>
  );
}

/**
 * One List line: its tick, the name (the link: your remembered product or a
 * search, as the server resolved it), what follows small, its price and how
 * many, and **+ Cart** (TEC-190). **The tick is its own tap target**, so ticking
 * in the shop never opens King Soopers (TEC-39). The ★ / ? / + marker leads the
 * small text; the price is the nightly check's, or “no price yet”.
 */
function ListRow(props: {
  item: ShoppingLine;
  sale: SaleTag | null;
  onTick: () => void;
  onQuantity: (q: number) => void;
  canAdd: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const { item } = props;
  const mark = item.mark ?? "+";
  return (
    <li className="flex items-center gap-2.5 rounded-[10px] bg-surface py-2 pl-3 pr-2.5">
      <label className="flex shrink-0 cursor-pointer items-center self-stretch">
        <input type="checkbox" checked={item.checked} onChange={props.onTick} aria-label={`Got ${item.name}`} className="size-6 accent-accent" />
      </label>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={`text-[15px] font-semibold ${item.checked ? "text-ink-soft line-through" : ""}`}
        >
          {item.view?.name ?? item.name}
        </a>
        <span className="text-xs text-ink-soft">
          {!item.checked ? (
            <span title={MARK_WORDS[mark]} aria-label={MARK_WORDS[mark]} className={`mr-1 font-bold ${MARK_TONE[mark]}`}>
              {mark}
            </span>
          ) : null}
          {/* **On sale at the chosen store** (TEC-121 3a). Says sale, never coupon. */}
          {props.sale ? <span className="mr-1 whitespace-nowrap rounded border border-accent px-1 text-[11px] text-accent">{saleText(props.sale)}</span> : null}
          {details(item).join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Price price={item.price} />
        <Quantity key={`${item.id}:${item.quantity}`} item={item} onCommit={props.onQuantity} />
      </span>
      {props.canAdd && !item.checked ? (
        <button
          type="button"
          aria-label="Add to cart"
          onClick={props.onAdd}
          className="h-8 shrink-0 whitespace-nowrap rounded-lg bg-accent px-2.5 text-xs font-bold text-accent-ink disabled:opacity-50"
        >
          {props.adding ? "…" : "+ Cart"}
        </button>
      ) : null}
    </li>
  );
}

/** A line's price from the nightly check, or “no price yet”: never $0. */
function Price({ price }: { price: LinePrice | null | undefined }) {
  return price ? (
    <span className="whitespace-nowrap text-[13px] tabular-nums" title={price.onSale ? "On sale in the last nightly check" : undefined}>
      {money(price.total)}
    </span>
  ) : (
    <span className="whitespace-nowrap text-[11px] text-ink-soft">no price yet</span>
  );
}

/** One In cart line: what Cookbook sent, its price, and **Remove** (Take back for this line). */
function InCartRow(props: { item: ShoppingLine; disabled: boolean; removing: boolean; onRemove: () => void }) {
  const { item } = props;
  const small = [item.quantity > 1 ? `×${item.quantity}` : null, ...details(item)].filter((x): x is string => !!x);
  return (
    <li className="flex items-center gap-2.5 rounded-[10px] bg-raised py-2 pl-3 pr-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <a href={item.href} target="_blank" rel="noreferrer" className="text-[15px] font-semibold">
          {item.view?.name ?? item.name}
        </a>
        <span className="text-xs text-ink-soft">{small.join(" · ")}</span>
      </span>
      <Price price={item.price} />
      <button
        type="button"
        aria-label={`Remove ${item.view?.name ?? item.name} from the cart`}
        onClick={props.onRemove}
        disabled={props.disabled}
        className="min-h-11 shrink-0 rounded-[10px] border border-line bg-transparent px-3 text-[13px] disabled:opacity-50"
      >
        {props.removing ? "Removing…" : "Remove"}
      </button>
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
