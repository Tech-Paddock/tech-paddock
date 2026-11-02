"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { refreshDue, scanDue } from "@/lib/refreshDue";
import type { CartLine, CartPick, Outcome, ReviewLine } from "@/lib/cart";
import { guessPick, guessPicks, needsSplash, pickOf, pickerOptions, type PickerOption } from "@/lib/cartGuess";
import type { CartRefresh } from "@/lib/cartRefresh";
import type { Modality } from "@/lib/modality";
import type { ScanRecord } from "@/lib/pricing";
import { refreshSummary } from "@/lib/refreshNote";
import type { TakeBackOutcome } from "@/lib/takeBack";
import { useToast } from "./Toast";

/**
 * Send to cart — King Soopers (TEC-90; `RULES.md`, *Send to cart*), on the
 * list tab. Connect once, pick a store once.
 *
 * **No review, no pop-up lists** (TEC-206; owner, 2026-11-02: "I don't want to
 * reconfirm and read a list"). **Send all** and **+ Cart** go in as the best
 * guess (`lib/cartGuess.ts`): the one saved product or the name's default, the
 * most-bought of several, else Kroger's top match. After a send every line
 * reports added, skipped or failed (`SendResults`). Whatever goes in is
 * remembered in Your brands (TEC-128). **No model picks anything.**
 *
 * **Cookbook is the only way anything enters the cart** (owner): In cart is the
 * whole King Soopers cart. **Refresh cart** re-reads the ledger and prices the
 * cart today with the app's token, never the account's.
 *
 * **The one picker that stays** is `ProductSplash`: Add an item opens a choice
 * of products when several match and none is the default; **Change** on an In
 * cart line opens the same one.
 *
 * **Refresh** (2026-10-20): opening the tab with the last refresh over a week
 * old starts one in the background; *Refresh now* starts one by hand.
 * **Every request that borrows the account's Kroger token goes through
 * `serial`**, one at a time: two at once can race the refresh token's rotation.
 *
 * The state lives in `useCart`; `List.tsx` lays it out. Local patterns, named so
 * they are a decision deferred rather than drift: the result chips, the splash
 * and the store picker. They reuse the theme's tokens only.
 */

type Status = {
  configured: boolean;
  problems: string[];
  connected: boolean;
  store: { locationId: string; name: string } | null;
  refreshedAt: string | null;
  modality: Modality;
};

type Store = { locationId: string; name: string; address: string };

type Results = {
  outcomes: Outcome[];
  summary: string;
  recordError: string | null;
  modalityWarning: string | null;
};

type TakeBackResult = { outcomes: TakeBackOutcome[]; summary: string; recordError: string | null; failed: boolean };

/** The lines a splash still has to settle, and whether it is Change on an In cart line. */
type Splash = { queue: ReviewLine[]; change: boolean };

const CALLBACK_WORDS: Record<string, string> = {
  connected: "King Soopers connected.",
  declined: "The Kroger sign-in was cancelled. Nothing was saved.",
  "bad-state": "That sign-in didn't start from this page, so it was refused. Tap Connect King Soopers again.",
  failed: "Kroger didn't complete the sign-in. Nothing was saved — try Connect again.",
  unconfigured: "Send to cart isn't set up on this deployment.",
};

const LINK = "underline decoration-dotted underline-offset-2";
const HEADING = "text-xs font-bold uppercase tracking-wider";

export function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * **One Kroger request at a time, for the whole page.** Each borrows the
 * refresh token, and two at once can race its rotation (NOTES.md); opening
 * the list can start a refresh and a deal scan together, and Your brands has
 * its own Refresh now (TEC-135). Module-level, so every tab shares the one
 * queue. A failed task does not stop the next.
 */
let krogerQueue: Promise<unknown> = Promise.resolve();
export function serialKroger<T>(task: () => Promise<T>): Promise<T> {
  const run = krogerQueue.then(task, task);
  krogerQueue = run.catch(() => undefined);
  return run;
}

export type CartState = ReturnType<typeof useCart>;

export function useCart({ onBrandsChanged, onListChanged }: { onBrandsChanged: () => void; onListChanged: () => void }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // Refs, so a parent re-render (every tick on the list) never re-runs the
  // on-open effect below and re-reads the connection.
  const brandsChanged = useRef(onBrandsChanged);
  brandsChanged.current = onBrandsChanged;
  const listChanged = useRef(onListChanged);
  listChanged.current = onListChanged;

  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [zip, setZip] = useState("");
  const [stores, setStores] = useState<Store[] | null>(null);
  const [choosingStore, setChoosingStore] = useState(false);

  const [busy, setBusy] = useState<null | "stores" | "lookup" | "add" | "send" | "disconnect" | "take-back" | "cart-check">(null);
  const [takeBackResults, setTakeBackResults] = useState<TakeBackResult | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  // After Send (TEC-206): every line reports added, skipped or failed.
  const [results, setResults] = useState<Results | null>(null);
  // The one picker that stays (TEC-206).
  const [splash, setSplash] = useState<Splash | null>(null);
  // Refresh cart (TEC-206): today's prices for what is in the cart, and when they were read.
  const [cartCheck, setCartCheck] = useState<CartRefresh | null>(null);
  const [cartCheckError, setCartCheckError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ text: string; failed: boolean; summary?: { line: string; needsLook: boolean } } | null>(null);
  const autoRefreshed = useRef(false);
  const autoChecked = useRef(false);

  const [latestScan, setLatestScan] = useState<ScanRecord | null>(null);
  // Only a failure is shown (TEC-132): the scan fills a Deals row for a
  // product with no fresh night, and the panel that showed its results is gone.
  const [scanNote, setScanNote] = useState<{ text: string; failed: boolean } | null>(null);
  const autoScanned = useRef(false);

  const serial = serialKroger;

  const loadStatus = useCallback(async (): Promise<Status | null> => {
    try {
      const response = await fetch("/api/kroger", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the King Soopers connection.");
      setStatus(body as Status);
      setStatusError(null);
      return body as Status;
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Couldn't read the King Soopers connection.");
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await serial(() => fetch("/api/kroger/refresh", { method: "POST" }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        // **Said in words, and never as "nothing changed".**
        setRefreshNote({ text: `Refresh failed: ${body.error ?? "Kroger or the database didn't answer."}`, failed: true });
      } else {
        setRefreshNote({ text: body.message as string, failed: false, summary: refreshSummary(body.report) ?? undefined });
      }
      await loadStatus();
      brandsChanged.current();
    } catch {
      setRefreshNote({ text: "Refresh failed: couldn't reach this app's server.", failed: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, serial]);

  /**
   * **Refresh cart** (TEC-206): the ledger fixes In cart, and today's price is read for each
   * In cart line at the chosen store. The server uses the app's token, so this is not in
   * `serial`. `quiet` (on open) says nothing unless something was fixed or it failed.
   */
  const refreshCart = useCallback(async (quiet = false) => {
    setBusy((b) => b ?? "cart-check");
    try {
      const response = await fetch("/api/kroger/cart/refresh", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't refresh the cart.");
      const check = body as CartRefresh;
      setCartCheck(check);
      setCartCheckError(null);
      const { added, removed } = check.fixed;
      if (added > 0 || removed > 0) {
        listChanged.current();
        toastRef.current.notice(
          `In cart now matches what Cookbook sent: ${added} put in, ${removed} back on the List.`
        );
      } else if (!quiet) {
        toastRef.current.notice("The cart is up to date.");
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : "Couldn't refresh the cart.";
      setCartCheckError(text);
      if (!quiet) toastRef.current.error(text);
    } finally {
      setBusy((b) => (b === "cart-check" ? null : b));
    }
  }, []);

  /** The latest appended scan, or null for never. */
  const loadScan = useCallback(async (): Promise<ScanRecord | null | undefined> => {
    try {
      const response = await fetch("/api/kroger/deals", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the last deal scan.");
      setLatestScan(body.latest as ScanRecord | null);
      return body.latest as ScanRecord | null;
    } catch (e) {
      setScanNote({ text: e instanceof Error ? e.message : "Couldn't read the last deal scan.", failed: true });
      return undefined;
    }
  }, []);

  const scan = useCallback(
    async () => {
      try {
        const response = await serial(() =>
          fetch("/api/kroger/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trigger: "opened" }),
          })
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          // **Said in words, never as "no deals".**
          setScanNote({ text: `Deal scan failed: ${body.error ?? "Kroger or the database didn't answer."}`, failed: true });
        } else {
          setLatestScan(body.scan as ScanRecord);
          setScanNote(null);
        }
      } catch {
        setScanNote({ text: "Deal scan failed: couldn't reach this app's server.", failed: true });
      }
    },
    [serial]
  );

  // On open: read the connection, say how a sign-in just went, and start a
  // refresh **in the background** when the last one is over a week old.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("kroger");
    if (outcome) {
      const words = CALLBACK_WORDS[outcome] ?? "Something unexpected came back from Kroger.";
      if (outcome === "connected") toastRef.current.notice(words);
      else toastRef.current.error(words);
      params.delete("kroger");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }

    void loadStatus().then(async (s) => {
      if (s && !autoRefreshed.current && refreshDue(s)) {
        autoRefreshed.current = true;
        void refresh(); // not awaited: the page is never held for it
      }
      // The cart, read from the ledger and priced today (TEC-206), once on open.
      if (s?.configured && s.connected && s.store && !autoChecked.current) {
        autoChecked.current = true;
        void refreshCart(true);
      }
      // The deal scan, on the refresh's rule (TEC-121). Queued behind any
      // refresh by `serial`, and likewise never awaited by the page.
      if (s?.store) {
        const latest = await loadScan();
        if (latest !== undefined && !autoScanned.current && scanDue({ ...s, hasStore: true }, latest?.ran_at ?? null)) {
          autoScanned.current = true;
          void scan();
        }
      }
    });
  }, [loadStatus, refresh, refreshCart, loadScan, scan]);

  async function chooseModality(modality: Modality) {
    if (!status) return;
    const before = status.modality;
    setStatus({ ...status, modality });
    try {
      const response = await fetch("/api/kroger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modality }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't save pickup or delivery.");
    } catch (e) {
      setStatus((current) => (current ? { ...current, modality: before } : current));
      toast.error(e instanceof Error ? e.message : "Couldn't save pickup or delivery.");
    }
  }

  async function findStores() {
    if (busy) return;
    setBusy("stores");
    try {
      const response = await serial(() => fetch(`/api/kroger/store?zip=${encodeURIComponent(zip.trim())}`, { cache: "no-store" }));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't find stores.");
      setStores(body.stores as Store[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't find stores.");
    } finally {
      setBusy(null);
    }
  }

  async function pickStore(store: Store) {
    try {
      const response = await fetch("/api/kroger/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: store.locationId, name: store.name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save the store.");
      setStores(null);
      setChoosingStore(false);
      await loadStatus();
      // A new store means new prices: check them now rather than in a week.
      void refresh();
      void refreshCart(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the store.");
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy("disconnect");
    try {
      const response = await fetch("/api/kroger", { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't disconnect.");
      setResults(null);
      setSplash(null);
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(null);
    }
  }

  /** Look lines up at Kroger. `ids` limits it to those lines; `includeSent` lets Change look up a line already in the cart. */
  async function lookUp(ids: string[] | null, includeSent = false): Promise<ReviewLine[]> {
    const query = ids ? `?ids=${encodeURIComponent(ids.join(","))}${includeSent ? "&include=sent" : ""}` : "";
    const response = await serial(() => fetch(`/api/kroger/cart${query}`, { cache: "no-store" }));
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Couldn't get the list ready.");
    return body.lines as ReviewLine[];
  }

  function clearNotes() {
    setResults(null);
    setTakeBackResults(null);
  }

  /** One POST of picks; `only` limits what the server sends and reports. A repeat (409) comes back as `conflict`. */
  async function post(chosen: CartPick[], only: string[] | null): Promise<{ body: Record<string, unknown> } | { conflict: CartLine[] }> {
    const response = await serial(() =>
      fetch("/api/kroger/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: chosen, ...(only ? { only } : {}) }),
      })
    );
    const body = await response.json();
    if (response.status === 409 && Array.isArray(body.alreadySent)) return { conflict: body.alreadySent as CartLine[] };
    if (!response.ok) throw new Error(body.error ?? "Couldn't send to the cart.");
    return { body };
  }

  /** What a send changed, told once: the modality warning and a failed record. */
  function afterSend(body: Record<string, unknown>) {
    if (body.modalityWarning) toast.error(body.modalityWarning as string);
    if (body.recordError) toast.error(body.recordError as string);
    brandsChanged.current();
    listChanged.current();
    void refreshCart(true);
  }

  /**
   * **Send all** (TEC-206): the caller has already asked "Send N items?". Every line still
   * on the List goes in as its best guess, and the results say added, skipped or failed for each.
   */
  async function sendAll() {
    if (busy) return;
    setBusy("send");
    clearNotes();
    try {
      const lines = await lookUp(null);
      const picks = guessPicks(lines);
      if (picks.length === 0) {
        toast.notice("Nothing on the List to send.");
        return;
      }
      const sent = await post(picks, null);
      if ("conflict" in sent) {
        toast.error(`Already in the cart: ${sent.conflict.map((l) => l.name).join(", ")}. The cart only adds, so nothing was sent.`);
        listChanged.current();
        return;
      }
      const body = sent.body;
      const shown = new Set(lines.map((l) => l.id));
      setResults({
        outcomes: (body.outcomes as Outcome[]).filter((o) => shown.has(o.id)),
        summary: body.summary as string,
        recordError: (body.recordError as string | null) ?? null,
        modalityWarning: (body.modalityWarning as string | null) ?? null,
      });
      afterSend(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send to the cart.");
    } finally {
      setBusy(null);
    }
  }

  /** **+ Cart on one line** (TEC-206): the caller has asked "Add 1 to the cart?"; it goes in as the best guess and reports in a toast. */
  async function addOne(id: string) {
    if (busy) return;
    setBusy("add");
    setAdding(id);
    clearNotes();
    try {
      const [line] = await lookUp([id]);
      if (!line) throw new Error("That line isn't on the List any more, so there was nothing to add. It may already be in the cart.");
      const sent = await post([guessPick(line)], [id]);
      if ("conflict" in sent) {
        toast.error(`${line.name} is already in the cart. The cart only adds, so it wasn't sent again.`);
        listChanged.current();
        return;
      }
      const outcome = (sent.body.outcomes as Outcome[]).find((o) => o.id === id);
      if (outcome?.result === "added") toast.notice(`${outcome.name} is in the cart. ${outcome.detail}`);
      else toast.error(`${line.name} wasn't added. ${outcome?.detail ?? "Kroger didn't say why."}`);
      afterSend(sent.body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that to the cart.");
    } finally {
      setBusy(null);
      setAdding(null);
    }
  }

  /**
   * **The one picker that stays** (TEC-206): after Add an item, look the new lines up and open
   * the splash for each that matches several saved products with no default.
   */
  async function offerChoices(ids: string[]) {
    if (!status?.configured || !status.connected || !status.store || ids.length === 0) return;
    try {
      const lines = (await lookUp(ids)).filter((l) => needsSplash(l.plan));
      if (lines.length > 0) setSplash({ queue: lines, change: false });
    } catch {
      // The lines are on the List either way; a failed look-up only means no splash.
    }
  }

  /** **Change** on an In cart line: the same picker, for the product that went in. */
  async function changeLine(id: string) {
    if (busy) return;
    setBusy("lookup");
    try {
      const [line] = await lookUp([id], true);
      if (!line || pickerOptions(line.plan).length === 0) {
        toast.error("There's nothing else to choose for that line.");
        return;
      }
      setSplash({ queue: [line], change: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't look that up.");
    } finally {
      setBusy(null);
    }
  }

  function leaveSplash() {
    setSplash((s) => (s && s.queue.length > 1 ? { ...s, queue: s.queue.slice(1) } : null));
  }

  /**
   * A tap in the splash. Add an item: that product goes into the cart now (and becomes the
   * default with the tick). Change: the old product is taken back out first, then this one goes in.
   */
  async function chooseProduct(option: PickerOption, makeDefault: boolean) {
    const current = splash;
    const line = current?.queue[0];
    if (!current || !line || busy) return;
    setBusy("add");
    try {
      if (current.change) {
        const gone = await takeBackRequest([line.id]);
        if (gone.failed) {
          setTakeBackResults(gone);
          throw new Error("The old product wouldn't come out of the cart, so nothing was changed.");
        }
      }
      const sent = await post([pickOf(line, option, makeDefault)], [line.id]);
      if ("conflict" in sent) throw new Error(`${line.name} is already in the cart.`);
      const outcome = (sent.body.outcomes as Outcome[]).find((o) => o.id === line.id);
      if (outcome?.result === "added") toast.notice(`${outcome.name} is in the cart. ${outcome.detail}`);
      else toast.error(`${line.name} wasn't added. ${outcome?.detail ?? "Kroger didn't say why."}`);
      afterSend(sent.body);
      leaveSplash();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that to the cart.");
      listChanged.current();
      setSplash(null);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Take back: `ids`, or every line Cookbook sent when null. The ledger rows are written
   * before Kroger is asked and the recorded Pickup/Delivery choice goes with the negative
   * add (`lib/takeBack.ts`); a line Kroger refuses stays in the cart, and the result says so.
   */
  async function takeBackRequest(ids: string[] | null): Promise<TakeBackResult> {
    const response = await serial(() =>
      fetch("/api/kroger/cart/take-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, ...(ids ? { ids } : {}) }),
      })
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Couldn't take back from the cart.");
    listChanged.current();
    void refreshCart(true);
    return { outcomes: body.outcomes, summary: body.summary, recordError: body.recordError ?? null, failed: body.failed === true };
  }

  /** **Remove** one In cart line; the caller has asked "Take 1 out of the cart?". */
  async function removeOne(id: string) {
    if (busy) return;
    setBusy("take-back");
    setRemoving(id);
    setTakeBackResults(null);
    try {
      setTakeBackResults(await takeBackRequest([id]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't take that back out of the cart.");
    } finally {
      setBusy(null);
      setRemoving(null);
    }
  }

  /**
   * **Clear cart** (TEC-206): takes back every line in In cart, by negative quantities as
   * Take back always has. The caller has asked "Clear the cart?"; there is no preview list
   * and no step at King Soopers.
   */
  async function clearCart() {
    if (busy) return;
    setBusy("take-back");
    setResults(null);
    try {
      setTakeBackResults(await takeBackRequest(null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't clear the cart.");
    } finally {
      setBusy(null);
    }
  }

  const ready = !!status?.configured && !!status.connected && !!status.store && !choosingStore;

  return {
    status,
    statusError,
    ready,
    zip,
    setZip,
    stores,
    choosingStore,
    setChoosingStore,
    busy,
    takeBackResults,
    dismissTakeBack: () => setTakeBackResults(null),
    adding,
    removing,
    results,
    dismissResults: () => setResults(null),
    splash,
    leaveSplash,
    chooseProduct,
    cartCheck,
    cartCheckError,
    refreshing,
    refreshNote,
    latestScan,
    scanNote,
    refresh,
    refreshCart: () => refreshCart(false),
    chooseModality,
    findStores,
    pickStore,
    disconnect,
    sendAll,
    addOne,
    offerChoices,
    changeLine,
    removeOne,
    clearCart,
  };
}

// ---------------------------------------------------------------------------
// The panel under the list: connection and refresh. The store is chosen in the
// list's header (TEC-206).
// Deals are not here since TEC-132: they live on the Deals tab, and the list
// keeps only each line's sale bubble (TEC-196, from the nightly prices).
// ---------------------------------------------------------------------------

/** Search for a store by ZIP and pick one. In the list's header; also the first-time step in the panel. */
export function StorePicker({ cart }: { cart: CartState }) {
  const { status } = cart;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-soft">Pick your store, so matches are priced and stocked there.</p>
      <div className="flex gap-2">
        <input
          value={cart.zip}
          onChange={(e) => cart.setZip(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && /^\d{5}$/.test(cart.zip.trim()) && cart.busy === null) void cart.findStores();
          }}
          inputMode="numeric"
          placeholder="ZIP"
          aria-label="ZIP code"
          className="w-28 rounded-lg border border-line bg-surface p-2 text-base"
        />
        <button
          type="button"
          onClick={() => void cart.findStores()}
          disabled={!/^\d{5}$/.test(cart.zip.trim()) || cart.busy !== null}
          className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {cart.busy === "stores" ? "Looking…" : "Find stores"}
        </button>
        {status?.store ? (
          <button type="button" onClick={() => cart.setChoosingStore(false)} className="text-sm text-ink-soft">
            Cancel
          </button>
        ) : null}
      </div>
      {cart.stores !== null ? (
        cart.stores.length === 0 ? (
          <p className="text-sm text-ink-soft">No King Soopers near that ZIP.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {cart.stores.map((s) => (
              <li key={s.locationId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {s.name}
                  <span className="block text-[11px] text-ink-soft">{s.address}</span>
                </span>
                <button type="button" onClick={() => void cart.pickStore(s)} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs">
                  Use this store
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function CartPanel({ cart }: { cart: CartState }) {
  const { status } = cart;
  let body: ReactNode;
  if (status === null) {
    body = cart.statusError ? (
      <p role="alert" className="text-sm text-danger">{cart.statusError}</p>
    ) : (
      <p className="text-sm text-ink-soft">Checking the King Soopers connection…</p>
    );
  } else if (!status.configured) {
    // **In words, naming the variable** — never a dead button.
    body = <p className="text-sm text-ink-soft">Send to cart isn&rsquo;t set up on this deployment: {status.problems.join("; ")}.</p>;
  } else if (!status.connected) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">
          Sign in to King Soopers once, and the list can go straight into your cart. Checkout stays at King Soopers.
        </p>
        <a href="/kroger/connect" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
          Connect King Soopers
        </a>
      </div>
    );
  } else if (!status.store) {
    body = <StorePicker cart={cart} />;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <button type="button" onClick={() => void cart.disconnect()} className={LINK}>
            disconnect
          </button>
          <span className="ml-auto">{status.refreshedAt ? `prices checked ${when(status.refreshedAt)}` : "prices not checked yet"}</span>
          <button
            type="button"
            onClick={() => void cart.refresh()}
            disabled={cart.refreshing}
            className="rounded border border-line px-2 py-1 disabled:opacity-50"
          >
            {cart.refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <h2 className="text-sm font-semibold">King Soopers</h2>
      {body}
      {cart.scanNote?.failed ? (
        <p role="alert" className="text-xs text-danger">
          {cart.scanNote.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The refresh log (TEC-190): **collapsed**, one summary line (checked, updated,
 * how many sizes changed), the full sentence on a tap. A refresh that failed
 * outright stays open as an alert, and a partial one counts what it could not
 * check in the summary, so collapsing never hides a problem.
 */
export function RefreshLog({ cart }: { cart: CartState }) {
  if (cart.refreshing && !cart.refreshNote) {
    return <p className="px-2 text-xs text-ink-soft">Checking prices and stock in the background…</p>;
  }
  const note = cart.refreshNote;
  if (!note) return null;
  if (note.summary) {
    return (
      <details className="rounded-[10px] bg-surface px-3 py-2.5 text-[13px] text-ink-soft">
        <summary className={`min-h-6 cursor-pointer ${note.summary.needsLook ? "text-warn" : ""}`}>{note.summary.line}</summary>
        <p className="mt-2 text-xs">{note.text}</p>
      </details>
    );
  }
  return (
    <p role={note.failed ? "alert" : undefined} className={`px-2 text-xs ${note.failed ? "text-danger" : "text-ink-soft"}`}>
      {note.text}
    </p>
  );
}

function ResultChip({ result, good }: { result: string; good: string }) {
  return (
    <span
      className={`shrink-0 rounded border px-1.5 text-[11px] ${
        result === good ? "border-accent text-accent" : result === "failed" ? "border-danger/60 text-danger" : "border-line text-ink-soft"
      }`}
    >
      {result}
    </span>
  );
}

/**
 * What a Clear cart or Remove did. **One summary line**; only a line Kroger
 * refused is named, because a partial take-back must never read as whole. It
 * never claims the cart is empty beyond what the ledger says.
 */
export function TakeBackResults({ results, onClose }: { results: TakeBackResult; onClose: () => void }) {
  const trouble = results.outcomes.filter((o) => o.result !== "taken back");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 text-sm font-semibold">{results.summary}</h3>
        <button type="button" onClick={onClose} className={`text-xs ${LINK}`}>
          Dismiss
        </button>
      </div>
      {trouble.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {trouble.map((o) => (
            <li key={o.id} className="flex items-baseline gap-2">
              <ResultChip result={o.result} good="taken back" />
              <span className="min-w-0">
                {o.name} <span className="text-ink-soft">— {o.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {results.recordError ? <p className="text-xs text-danger">{results.recordError}</p> : null}
      {results.failed ? (
        <p role="alert" className="text-xs text-warn">
          Not everything came back out. Tap Refresh cart to see what is still in.
        </p>
      ) : null}
    </div>
  );
}

/**
 * After Send (TEC-206): **every line reports added, skipped or failed**, so a
 * partial send never reads as whole. Shown in place on the list, not in front
 * of it, and dismissed with a tap.
 */
export function SendResults({ cart }: { cart: CartState }) {
  const results = cart.results;
  if (!results) return null;
  const added = results.outcomes.filter((o) => o.result === "added");
  const left = results.outcomes.filter((o) => o.result !== "added");
  return (
    <section aria-label="Send results" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 px-2">
        <h3 className="text-lg font-bold">
          Sent {added.length} item{added.length === 1 ? "" : "s"}
          {left.length > 0 ? ` · ${left.length} not sent` : ""}
        </h3>
        <button type="button" onClick={cart.dismissResults} className="text-[13px] text-accent underline-offset-2 hover:underline">
          Dismiss
        </button>
      </div>
      <p className={`${HEADING} px-2 text-ink-soft`}>{results.summary}</p>
      <ul className="flex flex-col overflow-hidden rounded-xl bg-surface">
        {results.outcomes.map((o) => (
          <li key={o.id} className="flex items-baseline gap-2 border-t border-line/40 px-3.5 py-2.5 text-sm first:border-t-0">
            <ResultChip result={o.result} good="added" />
            <span className="min-w-0">
              {o.name} <span className="text-ink-soft">— {o.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {results.modalityWarning ? <p role="alert" className="px-2 text-xs text-warn">{results.modalityWarning}</p> : null}
      {results.recordError ? <p className="px-2 text-xs text-danger">{results.recordError}</p> : null}
      <a href={CHECKOUT_URL} target="_blank" rel="noreferrer" className="px-2 text-[13px] text-accent underline-offset-2 hover:underline">
        Go to checkout on King Soopers
      </a>
    </section>
  );
}

/**
 * **The one picker that stays** (TEC-206; owner: "Add an item opens a choice of
 * products when several match and none is the default"). A splash over the
 * list: tap a product to use it, tick **Make default** to keep it for that name.
 * The same splash is **Change** on an In cart line. Anything else about a send
 * is settled without asking.
 */
export function ProductSplash({ cart }: { cart: CartState }) {
  const splash = cart.splash;
  const line = splash?.queue[0];
  if (!splash || !line) return null;
  return <SplashBody key={line.id} cart={cart} line={line} change={splash.change} more={splash.queue.length - 1} />;
}

function SplashBody({ cart, line, change, more }: { cart: CartState; line: ReviewLine; change: boolean; more: number }) {
  const [makeDefault, setMakeDefault] = useState(false);
  const options = pickerOptions(line.plan);
  const matched = (line.plan.kind === "exact" || line.plan.kind === "settle") && line.plan.matched && options.length > 1;
  const working = cart.busy === "add";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cart.leaveSplash();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={`Which ${line.name}`} className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl bg-paper p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold">{change ? `Change ${line.name}` : `Which ${line.name}?`}</h2>
          <p className="text-[13px] text-ink-soft">
            {change ? "Tap the one that should be in the cart instead." : "Several match and none is your default. Tap one to add it to the cart."}
            {more > 0 ? ` ${more} more to choose after this.` : ""}
          </p>
        </div>
        <div role="group" aria-label={`Which ${line.name}`} className="flex flex-col gap-1.5">
          {options.map((o) => (
            <button
              key={o.upc}
              type="button"
              disabled={working}
              onClick={() => void cart.chooseProduct(o, makeDefault)}
              className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line bg-raised px-3 py-2.5 text-left text-ink disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">{o.label}</span>
                <span className="text-xs text-ink-soft">{o.detail || "not priced yet"}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold">
                {o.isDefault ? "★ " : ""}
                {o.fresh ? "Kroger's pick" : o.count > 0 ? `bought ${o.count}×` : "new"}
              </span>
            </button>
          ))}
        </div>
        {matched ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="size-[22px] accent-accent" />
            Make default
          </label>
        ) : null}
        <button type="button" onClick={cart.leaveSplash} disabled={working} className="min-h-11 self-start rounded-[10px] px-2 text-[15px] text-accent underline-offset-2 hover:underline disabled:opacity-50">
          {change ? "Cancel" : "Leave it on the list"}
        </button>
      </div>
    </div>
  );
}
