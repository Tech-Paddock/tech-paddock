"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { refreshDue, scanDue } from "@/lib/refreshDue";
import type { CartLine, CartPick, Outcome, ReviewLine } from "@/lib/cart";
import { guessPick, guessPicks, needsSplash, pickOf, pickerOptions, type PickerOption } from "@/lib/cartGuess";
import { optionTag } from "@/lib/itemMatches";
import type { CheckResult } from "@/lib/checkLine";
import type { CartRefresh } from "@/lib/cartRefresh";
import type { Modality } from "@/lib/modality";
import type { ScanRecord } from "@/lib/pricing";
import { refreshSummary } from "@/lib/refreshNote";
import { BACK_TO_LIST_WORDS, clearedWords } from "@/lib/takeBack";
import { useToast } from "./Toast";

/**
 * Send to cart — King Soopers (TEC-90; `RULES.md`, *Send to cart*), on the
 * list tab. Connect once, pick a store once.
 *
 * **No review, no pop-up lists** (TEC-206; owner, 2026-11-02: "I don't want to
 * reconfirm and read a list"). **Send all** and **+ Cart** go in as the best
 * guess (`lib/cartGuess.ts`): the one saved product, the name's default, the pack that fits, the
 * most purchased of several (TEC-214), else Kroger's top match. After a send every line
 * reports added, skipped or failed. Whatever goes in is
 * remembered in Your brands (TEC-128). **No model picks anything.**
 *
 * **Adds never ask, and there is no Sent list** (TEC-211; owner, 2026-11-02: "No
 * confirmation. I clicked it, it goes."). A send is one toast, "Sent 12" or
 * "Sent 12 · 2 not sent"; a line that did not go reads "not sent" in its price
 * spot until the next send (`notSent`).
 *
 * **The live check** (TEC-211): `runCheck` asks `GET /api/kroger/check` whether the
 * sign-in still works, on open, after any King Soopers call fails, and when the
 * status is tapped. It is in `serial` with everything else that borrows the token.
 *
 * **Cookbook is the only way anything enters the cart** (owner): In cart is the
 * whole King Soopers cart. **Refresh cart** re-reads the ledger and prices the
 * cart today with the app's token, never the account's.
 *
 * **The one picker that stays** is `ProductSplash`: Add an item opens a choice
 * of products when several match and none is the default. (**Change** on an In
 * cart line went in TEC-211.)
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

/** The lines a splash still has to settle. */
type Splash = { queue: ReviewLine[] };

/** Where this browser remembers the last check that passed, for "last worked ...". A convenience only. */
const LAST_WORKED_KEY = "cookbook:kroger-last-worked";

const CALLBACK_WORDS: Record<string, string> = {
  connected: "King Soopers connected.",
  declined: "The Kroger sign-in was cancelled. Nothing was saved.",
  "bad-state": "That sign-in didn't start from this page, so it was refused. Tap Connect King Soopers again.",
  failed: "Kroger didn't complete the sign-in. Nothing was saved — try Connect again.",
  unconfigured: "Send to cart isn't set up on this deployment.",
};

const LINK = "underline decoration-dotted underline-offset-2";
const HEADING = "text-xs font-bold uppercase tracking-wider";

/** The one toast after a send (TEC-211): "Sent 12" or "Sent 12 · 2 not sent". */
export function sentWords(added: number, notSent: number): string {
  return `Sent ${added}${notSent > 0 ? ` · ${notSent} not sent` : ""}`;
}

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
  const [adding, setAdding] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  // A line a send did not take, and why (TEC-211): "not sent" in its price spot until the next send.
  const [notSent, setNotSent] = useState<Map<string, string>>(new Map());
  // The live check (TEC-211): null until the first answer.
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [lastWorked, setLastWorked] = useState<string | null>(null);
  const checking = useRef(false);
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

  /**
   * **The live check** (TEC-211). Runs on open, after any King Soopers call fails, and when
   * the status is tapped. One at a time; in `serial` because it borrows the account's token.
   * A check that cannot even reach this app's server reads as "can't reach", with the reason.
   */
  const runCheck = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setCheck(null);
    try {
      const response = await serial(() => fetch("/api/kroger/check", { cache: "no-store" }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't check King Soopers.");
      const result = body as CheckResult;
      setCheck(result);
      if (result.state === "connected") {
        setLastWorked(result.checkedAt);
        try {
          window.localStorage.setItem(LAST_WORKED_KEY, result.checkedAt);
        } catch {
          // Private window or blocked storage: it is only a convenience.
        }
      }
    } catch (e) {
      setCheck({ state: "unreachable", checkedAt: new Date().toISOString(), detail: e instanceof Error ? e.message : "Couldn't check King Soopers.", problems: [] });
    } finally {
      checking.current = false;
    }
  }, [serial]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await serial(() => fetch("/api/kroger/refresh", { method: "POST" }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        // **Said in words, and never as "nothing changed".**
        setRefreshNote({ text: `Refresh failed: ${body.error ?? "Kroger or the database didn't answer."}`, failed: true });
        void runCheck();
      } else {
        setRefreshNote({ text: body.message as string, failed: false, summary: refreshSummary(body.report) ?? undefined });
      }
      await loadStatus();
      brandsChanged.current();
    } catch {
      setRefreshNote({ text: "Refresh failed: couldn't reach this app's server.", failed: true });
      void runCheck();
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, runCheck, serial]);

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
      const { removed } = check.fixed;
      if (removed > 0) {
        listChanged.current();
        toastRef.current.notice(`In cart now matches what Cookbook sent: ${removed} back on the List.`);
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
          void runCheck();
        } else {
          setLatestScan(body.scan as ScanRecord);
          setScanNote(null);
        }
      } catch {
        setScanNote({ text: "Deal scan failed: couldn't reach this app's server.", failed: true });
      }
    },
    [runCheck, serial]
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

    // The live check, once on open (TEC-211): the header never says "Connected" on a saved sign-in alone.
    try {
      setLastWorked(window.localStorage.getItem(LAST_WORKED_KEY));
    } catch {
      // Blocked storage: "last worked" just reads "no good check yet".
    }
    void runCheck();

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
  }, [loadStatus, refresh, refreshCart, loadScan, scan, runCheck]);

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
      setSplash(null);
      await loadStatus();
      void runCheck();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(null);
    }
  }

  /** Look lines up at Kroger. `ids` limits it to those lines. Only lines still on the List are ever looked up. */
  async function lookUp(ids: string[] | null): Promise<ReviewLine[]> {
    const query = ids ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
    const response = await serial(() => fetch(`/api/kroger/cart${query}`, { cache: "no-store" }));
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Couldn't get the list ready.");
    return body.lines as ReviewLine[];
  }

  function clearNotes() {
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
   * **Send all** (TEC-206, TEC-211): no confirm; one tap sends. Every line still on the List
   * goes in as its best guess. The answer is one toast, "Sent 12" or "Sent 12 · 2 not sent",
   * and a line that did not go reads "not sent" in its price spot until the next send.
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
      setNotSent(new Map());
      const sent = await post(picks, null);
      if ("conflict" in sent) {
        toast.error(`Already in the cart: ${sent.conflict.map((l) => l.name).join(", ")}. The cart only adds, so nothing was sent.`);
        listChanged.current();
        return;
      }
      const body = sent.body;
      const shown = new Set(lines.map((l) => l.id));
      const outcomes = (body.outcomes as Outcome[]).filter((o) => shown.has(o.id));
      const left = outcomes.filter((o) => o.result !== "added");
      setNotSent(new Map(left.map((o) => [o.id, o.detail])));
      const words = sentWords(outcomes.length - left.length, left.length);
      if (left.length > 0) toast.error(words);
      else toast.notice(words);
      afterSend(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send to the cart.");
      void runCheck();
    } finally {
      setBusy(null);
    }
  }

  /** **+ Cart on one line** (TEC-206, TEC-211): no confirm; it goes in as the best guess and reports in a toast. */
  async function addOne(id: string) {
    if (busy) return;
    setBusy("add");
    setAdding(id);
    clearNotes();
    setNotSent((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    const failed = (detail: string) => setNotSent((m) => new Map(m).set(id, detail));
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
      else {
        failed(outcome?.detail ?? "Kroger didn't say why.");
        toast.error(`${line.name} wasn't added. ${outcome?.detail ?? "Kroger didn't say why."}`);
      }
      afterSend(sent.body);
    } catch (e) {
      failed(e instanceof Error ? e.message : "Couldn't add that to the cart.");
      toast.error(e instanceof Error ? e.message : "Couldn't add that to the cart.");
      void runCheck();
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
      if (lines.length > 0) setSplash({ queue: lines });
    } catch {
      // The lines are on the List either way; a failed look-up only means no splash.
    }
  }

  function leaveSplash() {
    setSplash((s) => (s && s.queue.length > 1 ? { ...s, queue: s.queue.slice(1) } : null));
  }

  /** A tap in the splash: that product goes into the cart now. It never becomes a default (TEC-214). */
  async function chooseProduct(option: PickerOption) {
    const current = splash;
    const line = current?.queue[0];
    if (!current || !line || busy) return;
    setBusy("add");
    try {
      const sent = await post([pickOf(line, option)], [line.id]);
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
   * **Back to list** (TEC-228) replaces Remove on an In cart line, with no confirm. The line
   * goes back to the List unsent. King Soopers is never asked: its Cart API cannot remove.
   */
  async function backToList(id: string) {
    if (busy) return;
    setBusy("take-back");
    setReturning(id);
    try {
      const response = await fetch("/api/kroger/cart/back-to-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't move that back to the list.");
      listChanged.current();
      void refreshCart(true);
      toast.notice(BACK_TO_LIST_WORDS);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't move that back to the list.");
    } finally {
      setBusy(null);
      setReturning(null);
    }
  }

  /**
   * **Clear cart** (TEC-206, TEC-210, TEC-228): marks every In cart line cleared in Cookbook and
   * nothing more. King Soopers is never asked (its Cart API cannot remove), and the toast says
   * its cart is not affected, with a link to it. The caller has asked "Clear the cart?".
   */
  async function clearCart() {
    if (busy) return;
    setBusy("take-back");
    try {
      const response = await fetch("/api/kroger/cart/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't clear the cart.");
      listChanged.current();
      void refreshCart(true);
      toast.notice(clearedWords(typeof body.cleared === "number" ? body.cleared : 0), { href: CHECKOUT_URL, label: "Open the King Soopers cart" });
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
    adding,
    returning,
    notSent,
    check,
    lastWorked,
    runCheck,
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
    backToList,
    clearCart,
  };
}

// ---------------------------------------------------------------------------
// The King Soopers panel at the bottom is gone (TEC-211): its connection, store,
// Pickup/Delivery, prices checked, Refresh now and disconnect are in the list's
// header, beside the live status. Deals are not here since TEC-132.
// ---------------------------------------------------------------------------

/** Search for a store by ZIP and pick one. In the list's header, for the first store and for Change store. */
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
  // Nothing to report yet: just when the prices were last checked (it moved here from the panel, TEC-211).
  if (!note) {
    const at = cart.status?.configured && cart.status.connected && cart.status.store ? cart.status.refreshedAt : undefined;
    if (at === undefined) return null;
    return <p className="px-2 text-xs text-ink-soft">{at ? `Prices checked ${when(at)}` : "Prices not checked yet"}</p>;
  }
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

/**
 * **The one picker that stays** (TEC-206; owner: "Add an item opens a choice of
 * products when several match and none is the default"). A splash over the
 * list: tap a product to use it. It never sets a default (TEC-214).
 * Anything else about a send is settled without asking.
 */
export function ProductSplash({ cart }: { cart: CartState }) {
  const splash = cart.splash;
  const line = splash?.queue[0];
  if (!splash || !line) return null;
  return <SplashBody key={line.id} cart={cart} line={line} more={splash.queue.length - 1} />;
}

/** The backdrop's tap: close, but only for a tap on the backdrop itself (a tap inside the dialog bubbles up with another target). */
export function backdropTap(closeOnBackdrop: boolean, onClose: () => void): ((e: { target: unknown; currentTarget: unknown }) => void) | undefined {
  return closeOnBackdrop ? (e) => (e.target === e.currentTarget ? onClose() : undefined) : undefined;
}

/**
 * **The dialog look** the Which-chicken picker and the item popup share (TEC-226): a bottom
 * sheet on phones, centred from `sm`, `role=dialog`, closed by Escape. **A tap on the backdrop
 * closes it only when `closeOnBackdrop` is set** (the item popup, TEC-227: "allow clicking out of
 * the window to close"). The Which-chicken picker keeps it off, so a stray tap never loses a choice.
 */
export function SheetFrame({
  label,
  onClose,
  closeOnBackdrop = false,
  children,
}: {
  label: string;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={backdropTap(closeOnBackdrop, onClose)}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center"
    >
      <div role="dialog" aria-modal="true" aria-label={label} className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl bg-paper p-4">
        {children}
      </div>
    </div>
  );
}

function SplashBody({ cart, line, more }: { cart: CartState; line: ReviewLine; more: number }) {
  const options = pickerOptions(line.plan);
  const working = cart.busy === "add";

  return (
    <SheetFrame label={`Which ${line.name}`} onClose={cart.leaveSplash}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-bold">Which {line.name}?</h2>
        <p className="text-[13px] text-ink-soft">
          Several match and none stands out. Tap one to add it to the cart.
          {more > 0 ? ` ${more} more to choose after this.` : ""}
        </p>
      </div>
      <div role="group" aria-label={`Which ${line.name}`} className="flex flex-col gap-1.5">
        {options.map((o) => (
          <button
            key={o.upc}
            type="button"
            disabled={working}
            onClick={() => void cart.chooseProduct(o)}
            className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line bg-raised px-3 py-2.5 text-left text-ink disabled:opacity-50"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">{o.label}</span>
              <span className="text-xs text-ink-soft">{o.detail || "not priced yet"}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold">{optionTag(o)}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={cart.leaveSplash} disabled={working} className="min-h-11 self-start rounded-[10px] px-2 text-[15px] text-accent underline-offset-2 hover:underline disabled:opacity-50">
        Leave it on the list
      </button>
    </SheetFrame>
  );
}
