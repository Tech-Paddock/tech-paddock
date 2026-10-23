"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHECKOUT_URL, isKingSoopersProduct } from "@/lib/kingsoopers";
import { refreshDue, scanDue } from "@/lib/refreshDue";
import type { Candidate, CartLine, Outcome, Plan, ReviewLine } from "@/lib/cart";
import { describeDrift, sizeDrift } from "@/lib/sizeDrift";
import type { Modality } from "@/lib/modality";
import type { Estimate, ScanRecord } from "@/lib/pricing";
import { describe as describeHeld, type TakeBackLine, type TakeBackOutcome } from "@/lib/takeBack";
import { DealsPanel, EstimatePanel } from "./Deals";
import { useToast } from "./Toast";

/**
 * Send to cart — King Soopers (TEC-90; `RULES.md`, *Send to cart*), on the
 * list tab. Connect once, pick a store once, then **Send to cart** opens the
 * review (TEC-135, the owner's mockup of 2026-10-23): **one list in three
 * sections** —
 * - **Pick one**: several saved products and no default; the most-bought is
 *   pre-picked, and **Make default** (a plain checkbox) makes the pick the
 *   name's default when it goes in.
 * - **Going in**: one saved product, the name's default, or one the line
 *   names; tap to change.
 * - **Not saved yet**: Kroger's top match, ticked to add, or a pasted page.
 *
 * **Nothing is skipped silently**: every line goes unless **Not this trip** is
 * tapped, and after Send every unsent line stays listed under **Still on your
 * list**. Whichever goes in is remembered in Your brands (TEC-128). **No model
 * picks anything.** Every line reports added, skipped or failed, and **a line
 * already sent is not sent again without saying so**, because the Cart API
 * only adds. Checkout stays at King Soopers.
 *
 * **Refresh** (2026-10-20): opening the tab with the last refresh over a week
 * old starts one in the background; *Refresh now* starts one by hand.
 * **Prices (TEC-121)**: Pickup/Delivery, the estimate and the deal scan.
 * **Every request that borrows a Kroger token goes through `serial`**, one at
 * a time: two at once can race the refresh token's rotation.
 * **Take back (TEC-127)**: removes what Cookbook sent, after a second tap that
 * shows what will come out. Never says the cart is empty.
 *
 * The state lives in `useCart`; `List.tsx` lays out `SendView`, `CartPanel`
 * and `CartBar`. Local patterns, named so they are a decision deferred rather
 * than drift: the review's line rows, option buttons (filled when picked) and
 * section headings, the result chips, the Take back confirm and the store
 * picker. They reuse the theme's tokens only.
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

/**
 * What the user has decided for one line in the review. `on` is false only
 * after *Not this trip* (or for a line with nothing to add); `pick` is the
 * product chosen among the options; `url` a pasted product page.
 */
export type Choice = { on: boolean; pick: string | null; url: string; pasting: boolean; makeDefault: boolean };

type Results = {
  outcomes: Outcome[];
  summary: string;
  recordError: string | null;
  modalityWarning: string | null;
};

const CALLBACK_WORDS: Record<string, string> = {
  connected: "King Soopers connected.",
  declined: "The Kroger sign-in was cancelled. Nothing was saved.",
  "bad-state": "That sign-in didn't start from this page, so it was refused. Tap Connect King Soopers again.",
  failed: "Kroger didn't complete the sign-in. Nothing was saved — try Connect again.",
  unconfigured: "Send to cart isn't set up on this deployment.",
};

const LINK = "underline decoration-dotted underline-offset-2";
const HEADING = "text-xs font-bold uppercase tracking-wider";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(n: number | null): string | null {
  return n === null ? null : `$${n.toFixed(2)}`;
}

/** "bought N×" — the times-bought count, never a quantity (TEC-135). */
function bought(count: number): string {
  return count > 0 ? `bought ${count}×` : "new";
}

/** The options a product plan offers, the one it goes in as first. */
function optionsOf(plan: Plan): Candidate[] {
  return plan.kind === "exact" ? plan.options : plan.kind === "settle" ? plan.options : [];
}

/** Which section a line sits in (TEC-135). A line already sent sits apart, because sending it again doubles it. */
export function sectionOf(line: ReviewLine): "pick" | "going" | "new" | "sent" {
  if (line.sent_at !== null) return "sent";
  if (line.plan.kind === "settle") return "pick";
  if (line.plan.kind === "exact") return "going";
  return "new";
}

/** Before anyone taps: **every line goes**, Pick one with its most-bought pre-picked. A line already sent waits for a tap. */
function startingChoice(line: ReviewLine): Choice {
  const plan = line.plan;
  const fresh = line.sent_at === null;
  const pick = plan.kind === "exact" ? plan.upc : plan.kind === "settle" ? (plan.options[0]?.upc ?? null) : null;
  const on = fresh && (plan.kind === "exact" || plan.kind === "settle" || plan.kind === "match");
  return { on, pick, url: "", pasting: false, makeDefault: false };
}

type Pick = { id: string; upc?: string; url?: string; match?: string; size?: string; makeDefault?: true };

/** What a line sends, or null for Not this trip. */
export function pickFor(line: ReviewLine, choice: Choice): Pick | null {
  const plan = line.plan;
  if (choice.url.trim()) return { id: line.id, url: choice.url.trim() };
  if (!choice.on) return null;
  if (plan.kind === "exact" || plan.kind === "settle") {
    const option = optionsOf(plan).find((o) => o.upc === choice.pick);
    if (!option) return null;
    const matched = plan.matched;
    const defaulting = choice.makeDefault && matched && optionsOf(plan).length > 1 ? { makeDefault: true as const } : {};
    // The product a Going in line went in as, untouched, is never re-saved.
    if (plan.kind === "exact" && option.upc === plan.upc) return { id: line.id, upc: option.upc, ...defaulting };
    // The pick's page goes with it, so it is remembered the way a match is (TEC-131).
    return { id: line.id, upc: option.upc, match: option.url, ...defaulting };
  }
  if (plan.kind === "match") {
    const p = plan.product;
    return { id: line.id, upc: p.upc, match: p.url, ...(p.size ? { size: p.size } : {}) };
  }
  return null;
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

  const [busy, setBusy] = useState<null | "stores" | "review" | "send" | "disconnect" | "take-back-look" | "take-back">(null);
  // Take back (TEC-127): the first tap reads what would go, the second takes it.
  const [takeBackPreview, setTakeBackPreview] = useState<TakeBackLine[] | null>(null);
  const [takeBackResults, setTakeBackResults] = useState<{
    outcomes: TakeBackOutcome[];
    summary: string;
    recordError: string | null;
    failed: boolean;
  } | null>(null);
  const [review, setReview] = useState<ReviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [confirmAgain, setConfirmAgain] = useState(false);
  const [refused, setRefused] = useState<CartLine[] | null>(null);
  // After Send (TEC-135): the results, and the review they came from, so every
  // unsent line stays listed under Still on your list.
  const [results, setResults] = useState<Results | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ text: string; failed: boolean } | null>(null);
  const autoRefreshed = useRef(false);

  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ estimate: Estimate; message: string } | null>(null);
  const [showEstimate, setShowEstimate] = useState(false);

  const [latestScan, setLatestScan] = useState<ScanRecord | null>(null);
  const [scanLoaded, setScanLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
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
        setRefreshNote({ text: body.message as string, failed: false });
      }
      await loadStatus();
      brandsChanged.current();
    } catch {
      setRefreshNote({ text: "Refresh failed: couldn't reach this app's server.", failed: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, serial]);

  /** The latest appended scan, or null for never. */
  const loadScan = useCallback(async (): Promise<ScanRecord | null | undefined> => {
    try {
      const response = await fetch("/api/kroger/deals", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the last deal scan.");
      setLatestScan(body.latest as ScanRecord | null);
      setScanLoaded(true);
      return body.latest as ScanRecord | null;
    } catch (e) {
      setScanNote({ text: e instanceof Error ? e.message : "Couldn't read the last deal scan.", failed: true });
      return undefined;
    }
  }, []);

  const scan = useCallback(
    async (trigger: "opened" | "manual") => {
      setScanning(true);
      try {
        const response = await serial(() =>
          fetch("/api/kroger/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trigger }),
          })
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          // **Said in words, never as "no deals".**
          setScanNote({ text: `Deal scan failed: ${body.error ?? "Kroger or the database didn't answer."}`, failed: true });
        } else {
          setLatestScan(body.scan as ScanRecord);
          setScanLoaded(true);
          setScanNote({ text: body.message as string, failed: false });
        }
      } catch {
        setScanNote({ text: "Deal scan failed: couldn't reach this app's server.", failed: true });
      } finally {
        setScanning(false);
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
      // The deal scan, on the refresh's rule (TEC-121). Queued behind any
      // refresh by `serial`, and likewise never awaited by the page.
      if (s?.store) {
        const latest = await loadScan();
        if (latest !== undefined && !autoScanned.current && scanDue({ ...s, hasStore: true }, latest?.ran_at ?? null)) {
          autoScanned.current = true;
          void scan("opened");
        }
      }
    });
  }, [loadStatus, refresh, loadScan, scan]);

  async function chooseModality(modality: Modality) {
    if (!status) return;
    const before = status.modality;
    setStatus({ ...status, modality });
    setEstimate(null);
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

  async function calculate() {
    if (estimating) return;
    setEstimating(true);
    try {
      const response = await serial(() => fetch("/api/kroger/estimate", { method: "POST" }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't calculate the estimate.");
      setEstimate(body as { estimate: Estimate; message: string });
      setShowEstimate(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't calculate the estimate.");
    } finally {
      setEstimating(false);
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
      setReview(null);
      // The estimate was another store's prices.
      setEstimate(null);
      await loadStatus();
      // A new store means new prices: check them now rather than in a week.
      void refresh();
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
      setReview(null);
      setResults(null);
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * **Send to cart** (TEC-135; RULES.md): look every line up and open the
   * review. Nothing goes in until **Send N to cart**: the review is one list,
   * every line ticked, Pick one pre-picked to the most bought.
   */
  async function startReview() {
    if (busy) return;
    setBusy("review");
    setResults(null);
    setTakeBackPreview(null);
    setTakeBackResults(null);
    setRefused(null);
    setConfirmAgain(false);
    try {
      const response = await serial(() => fetch("/api/kroger/cart", { cache: "no-store" }));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't get the list ready.");
      const lines = body.lines as ReviewLine[];
      setReview(lines);
      setChoices(Object.fromEntries(lines.map((l) => [l.id, startingChoice(l)])));
      // The first line to settle starts open, as on the mockup.
      setOpen(lines.find((l) => sectionOf(l) === "pick")?.id ?? null);
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't get the list ready.");
    } finally {
      setBusy(null);
    }
  }

  function closeReview() {
    setReview(null);
    setResults(null);
    setRefused(null);
  }

  function choose(id: string, change: Partial<Choice>) {
    setChoices((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  const picks = (review ?? []).flatMap((line) => {
    const choice = choices[line.id];
    const pick = choice ? pickFor(line, choice) : null;
    if (pick) return [pick];
    // A fresh line with nothing to add still asks, so the server reports it rather than calling it Not this trip.
    return line.sent_at === null && line.plan.kind === "none" ? [{ id: line.id } as Pick] : [];
  });
  const going = picks.filter((p) => p.upc || p.url);
  const again = (review ?? []).filter((l) => l.sent_at !== null && going.some((p) => p.id === l.id));
  const badUrl = (review ?? []).some((l) => {
    const url = choices[l.id]?.url.trim();
    return !!url && !isKingSoopersProduct(url);
  });

  async function send() {
    if (busy || going.length === 0) return;
    setBusy("send");
    setRefused(null);
    try {
      const response = await serial(() =>
        fetch("/api/kroger/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picks, again: again.length > 0 && confirmAgain }),
        })
      );
      const body = await response.json();
      if (response.status === 409 && Array.isArray(body.alreadySent)) {
        setRefused(body.alreadySent as CartLine[]);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Couldn't send to the cart.");
      // Only the lines this review held; the server's summary counts every open line.
      const shown = new Set((review ?? []).map((l) => l.id));
      const outcomes = (body.outcomes as Outcome[]).filter((o) => shown.has(o.id));
      setResults({
        outcomes,
        summary: body.summary as string,
        recordError: body.recordError ?? null,
        modalityWarning: body.modalityWarning ?? null,
      });
      setOpen(null);
      window.scrollTo({ top: 0 });
      brandsChanged.current();
      listChanged.current();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send to the cart.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * **Take back, first tap**: read what Cookbook sent and is still on the list.
   * The ledger only, no Kroger call. Nothing is removed until the second tap.
   */
  async function lookTakeBack() {
    if (busy) return;
    setBusy("take-back-look");
    setTakeBackResults(null);
    try {
      const response = await fetch("/api/kroger/cart/take-back", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read what Cookbook sent.");
      setTakeBackPreview(body.lines as TakeBackLine[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read what Cookbook sent.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * **Take back, second tap.** Two taps, like the list's Clear: it can't be
   * undone from here (putting things back is another Send). Through `serial`,
   * because it borrows a Kroger token.
   */
  async function confirmTakeBack() {
    if (busy) return;
    setBusy("take-back");
    try {
      const response = await serial(() =>
        fetch("/api/kroger/cart/take-back", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        })
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't take back from the cart.");
      setTakeBackResults({
        outcomes: body.outcomes,
        summary: body.summary,
        recordError: body.recordError ?? null,
        failed: body.failed === true,
      });
      setTakeBackPreview(null);
      // What was sent has changed; a review or send result held here is now stale.
      setReview(null);
      setResults(null);
      listChanged.current();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't take back from the cart.");
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
    takeBackPreview,
    setTakeBackPreview,
    takeBackResults,
    review,
    choices,
    open,
    setOpen,
    choose,
    picks,
    going,
    again,
    badUrl,
    confirmAgain,
    setConfirmAgain,
    refused,
    results,
    refreshing,
    refreshNote,
    estimating,
    estimate,
    showEstimate,
    setShowEstimate,
    latestScan,
    scanLoaded,
    scanning,
    scanNote,
    refresh,
    scan,
    chooseModality,
    calculate,
    findStores,
    pickStore,
    disconnect,
    startReview,
    closeReview,
    send,
    lookTakeBack,
    confirmTakeBack,
  };
}

// ---------------------------------------------------------------------------
// The bottom bar: Send to cart and Take back stay at the bottom (TEC-135).
// ---------------------------------------------------------------------------

export function CartBar({ cart }: { cart: CartState }) {
  if (!cart.ready) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-line bg-paper px-4 py-3">
      <button
        type="button"
        onClick={() => void cart.startReview()}
        disabled={cart.busy !== null}
        className="min-h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-ink disabled:opacity-50"
      >
        {cart.busy === "review" ? "Looking up…" : "Send to cart"}
      </button>
      {/* **Says it leaves the rest** (RULES.md): Cookbook can only remove what it sent; the confirm says so. */}
      <button
        type="button"
        onClick={() => void cart.lookTakeBack()}
        disabled={cart.busy !== null || cart.takeBackPreview !== null}
        className="min-h-12 rounded-xl border border-accent px-4 text-sm font-semibold text-accent disabled:opacity-50"
      >
        {cart.busy === "take-back-look" ? "Checking…" : "Take back"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel under the list: connection, store, refresh, estimate, Take back,
// deals.
// ---------------------------------------------------------------------------

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
  } else if (!status.store || cart.choosingStore) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">Pick your store once, so matches are priced and stocked there.</p>
        <div className="flex gap-2">
          <input
            value={cart.zip}
            onChange={(e) => cart.setZip(e.target.value)}
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
          {status.store ? (
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
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <button type="button" onClick={() => cart.setChoosingStore(true)} className={LINK}>
            change store
          </button>
          <button type="button" onClick={() => void cart.disconnect()} className={LINK}>
            disconnect
          </button>
          <a href={CHECKOUT_URL} target="_blank" rel="noreferrer" className={LINK}>
            Go to checkout
          </a>
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

        {cart.takeBackPreview ? (
          <TakeBackConfirm
            lines={cart.takeBackPreview}
            working={cart.busy === "take-back"}
            onConfirm={() => void cart.confirmTakeBack()}
            onCancel={() => cart.setTakeBackPreview(null)}
          />
        ) : null}

        {cart.takeBackResults ? <TakeBackResults results={cart.takeBackResults} /> : null}

        {cart.estimate && cart.showEstimate ? (
          <EstimatePanel estimate={cart.estimate.estimate} message={cart.estimate.message} onClose={() => cart.setShowEstimate(false)} />
        ) : null}

        <DealsPanel
          latest={cart.latestScan}
          loaded={cart.scanLoaded}
          scanning={cart.scanning}
          note={cart.scanNote}
          onScan={() => void cart.scan("manual")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <h2 className="text-sm font-semibold">King Soopers</h2>
      {body}
      {cart.refreshing && !cart.refreshNote ? <p className="text-xs text-ink-soft">Checking prices and stock in the background…</p> : null}
      {cart.refreshNote ? (
        <p role={cart.refreshNote.failed ? "alert" : undefined} className={`text-xs ${cart.refreshNote.failed ? "text-danger" : "text-ink-soft"}`}>
          {cart.refreshNote.text}
        </p>
      ) : null}
    </div>
  );
}

function TakeBackResults({ results }: { results: { outcomes: TakeBackOutcome[]; summary: string; recordError: string | null; failed: boolean } }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <h3 className="text-sm font-semibold">{results.summary}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {results.outcomes.map((o) => (
          <li key={o.id} className="flex items-baseline gap-2">
            <ResultChip result={o.result} good="taken back" />
            <span className="min-w-0">
              {o.name} <span className="text-ink-soft">— {o.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {results.recordError ? <p className="text-xs text-danger">{results.recordError}</p> : null}
      {results.failed ? (
        <p role="alert" className="text-xs text-warn">
          Not everything came back out.{" "}
          <a href={CHECKOUT_URL} target="_blank" rel="noreferrer" className={LINK}>
            Open the King Soopers cart
          </a>{" "}
          to remove the rest by hand.
        </p>
      ) : null}
    </div>
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
 * Take back's confirm (TEC-127): **what will come out, before it does**, and
 * that nothing else in the cart is touched.
 */
function TakeBackConfirm(props: { lines: TakeBackLine[]; working: boolean; onConfirm: () => void; onCancel: () => void }) {
  const recorded = props.lines.filter((l) => l.held.length > 0);
  const unrecorded = props.lines.filter((l) => l.held.length === 0);

  if (props.lines.length === 0) {
    return (
      <div className="flex items-baseline gap-2 rounded-lg border border-line p-3 text-sm text-ink-soft">
        <span className="flex-1">Cookbook hasn&rsquo;t sent anything on this list to the cart, so there&rsquo;s nothing to take back.</span>
        <button type="button" onClick={props.onCancel} className={`text-xs ${LINK}`}>
          OK
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warn/60 p-3 text-sm">
      <p className="font-semibold">Take these back out of the King Soopers cart?</p>
      {recorded.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {recorded.map((l) => (
            <li key={l.id}>
              {l.name} <span className="text-ink-soft">{describeHeld(l.held)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {unrecorded.length > 0 ? (
        <p className="text-xs text-ink-soft">
          Skipped — sent before Cookbook recorded what went in: {unrecorded.map((l) => l.name).join(", ")}. Remove those on the King
          Soopers cart page.
        </p>
      ) : null}
      <p className="text-xs text-ink-soft">
        Only what Cookbook sent comes out; anything added to the cart elsewhere stays. This can&rsquo;t be undone from here — send again
        to put them back.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={props.onCancel} className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft">
          Keep them
        </button>
        <button
          type="button"
          onClick={props.onConfirm}
          disabled={props.working || recorded.length === 0}
          className="ml-auto rounded-lg border border-danger/60 px-3 py-2 text-sm text-danger disabled:opacity-50"
        >
          {props.working ? "Taking back…" : `Take back ${recorded.length} — sure?`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send to cart, the review (TEC-135; the mockup's SendFinal)
// ---------------------------------------------------------------------------

/** "was 12 oz, now 10 oz" on a saved product whose size changed since it was first bought (TEC-131). */
function DriftNote({ candidate }: { candidate: Candidate }) {
  const drift = sizeDrift(candidate.sizeFirst, candidate.size, candidate.price);
  return drift ? <span className="block text-[11px] text-warn">{describeDrift(drift)}</span> : null;
}

/** A tick box, drawn: filled with a ✓ when on. */
function Box({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-md text-sm font-bold ${
        on ? "bg-accent text-accent-ink" : "border-2 border-ink-soft"
      }`}
    >
      {on ? "✓" : ""}
    </span>
  );
}

function optionLabel(o: Candidate): string {
  return o.description ?? o.names[0] ?? `Product ${o.upc}`;
}

function detailOf(o: Candidate): string {
  return [o.size, money(o.price)].filter(Boolean).join(" · ");
}

/** One line of the review: the row (tap to open), and when open its options, Make default, Not this trip and a page box. */
function ReviewRow({ cart, line }: { cart: CartState; line: ReviewLine }) {
  const choice = cart.choices[line.id];
  if (!choice) return null;
  const plan = line.plan;
  const options = optionsOf(plan);
  const picked = options.find((o) => o.upc === choice.pick) ?? null;
  const pasted = choice.url.trim();
  const isOpen = cart.open === line.id;
  const fresh = plan.kind === "match" || plan.kind === "none";
  const on = !!pasted || choice.on;

  let summary: string;
  if (pasted) summary = "A pasted page — remembered when it goes in";
  else if (!choice.on) summary = plan.kind === "none" ? plan.reason : line.sent_at ? `Sent ${when(line.sent_at)} — tap to send again` : "Not this trip";
  else if (picked) summary = [optionLabel(picked), detailOf(picked), line.note].filter(Boolean).join(" · ");
  else if (plan.kind === "match")
    summary = `Kroger's pick: ${[plan.product.description, plan.product.size, money(plan.product.price)].filter(Boolean).join(" · ")}${
      plan.product.inStock === false ? " · out of stock" : ""
    }`;
  else summary = "";

  let badge = "";
  let strong = false;
  if (plan.kind === "exact" && choice.pick === plan.upc && plan.chosen === "default") {
    badge = "★ default";
    strong = true;
  } else if (plan.kind === "exact" && choice.pick === plan.upc && plan.chosen === "named") badge = "named";
  else if (plan.kind === "settle") badge = `${options.length} options`;
  else if (picked) badge = bought(picked.count);

  // A Not saved yet line ticks on and off; the rest open.
  const tap = () => {
    if (fresh && plan.kind === "match" && !pasted) cart.choose(line.id, { on: !choice.on });
    else cart.setOpen(isOpen ? null : line.id);
  };

  return (
    <li className="flex flex-col border-t border-line/40 first:border-t-0">
      <button type="button" onClick={tap} aria-expanded={fresh ? undefined : isOpen} className="flex min-h-11 items-center gap-2.5 px-3.5 py-3 text-left">
        <Box on={on} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">{line.name}</span>
          <span className="truncate text-xs text-ink-soft">{summary}</span>
        </span>
        {badge ? <span className={`shrink-0 text-xs ${strong ? "font-bold text-accent" : "text-ink-soft"}`}>{badge}</span> : null}
        <span className="min-w-7 shrink-0 text-right text-[15px] font-semibold">×{line.quantity}</span>
      </button>

      {fresh && plan.kind === "match" ? (
        <div className="-mt-1 flex gap-4 pb-2 pl-12 pr-3.5 text-[13px]">
          <a href={plan.product.url} target="_blank" rel="noreferrer" className={`text-accent ${LINK}`}>
            See it at King Soopers
          </a>
          <button type="button" onClick={() => cart.choose(line.id, { pasting: !choice.pasting })} className={`text-accent ${LINK}`}>
            Paste a product page
          </button>
        </div>
      ) : null}
      {fresh && plan.kind === "none" && !pasted ? (
        <div className="-mt-1 pb-2 pl-12 pr-3.5 text-[13px]">
          <button type="button" onClick={() => cart.choose(line.id, { pasting: !choice.pasting })} className={`text-accent ${LINK}`}>
            Paste a product page
          </button>
        </div>
      ) : null}

      {isOpen && !fresh ? (
        <div className="flex flex-col gap-1.5 pb-3 pl-12 pr-3.5">
          <div role="radiogroup" aria-label={`Which ${line.name}`} className="flex flex-col gap-1.5">
            {options.map((o) => {
              const sel = choice.on && !pasted && o.upc === choice.pick;
              return (
                <button
                  key={o.upc}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => cart.choose(line.id, { pick: o.upc, on: true, url: "" })}
                  className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left ${
                    sel ? "bg-accent text-accent-ink" : "border border-line bg-raised text-ink"
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{optionLabel(o)}</span>
                    <span className="text-xs opacity-85">{detailOf(o) || "not priced yet"}</span>
                    {o.missing ? <span className="text-[11px]">Kroger stopped returning it at the last refresh</span> : null}
                    {!sel ? <DriftNote candidate={o} /> : null}
                  </span>
                  <span className="shrink-0 text-xs font-semibold">
                    {o.isDefault ? "★ " : ""}
                    {bought(o.count)}
                  </span>
                </button>
              );
            })}
          </div>
          {options.length > 1 && (plan.kind === "exact" || plan.kind === "settle") && plan.matched ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={choice.makeDefault}
                onChange={(e) => cart.choose(line.id, { makeDefault: e.target.checked })}
                className="size-[22px] accent-accent"
              />
              Make default
            </label>
          ) : null}
          <div className="flex gap-4 text-[13px]">
            <button
              type="button"
              onClick={() => {
                cart.choose(line.id, { on: false, url: "", pasting: false });
                cart.setOpen(null);
              }}
              className={`text-accent ${LINK}`}
            >
              Not this trip
            </button>
            <button type="button" onClick={() => cart.choose(line.id, { pasting: !choice.pasting })} className={`text-accent ${LINK}`}>
              Paste a product page
            </button>
          </div>
        </div>
      ) : null}

      {choice.pasting || pasted ? (
        <div className="px-3.5 pb-3 pl-12">
          <input
            value={choice.url}
            onChange={(e) => cart.choose(line.id, { url: e.target.value })}
            placeholder="https://www.kingsoopers.com/p/… — remembered when it goes in"
            aria-label={`Exact product page for ${line.name}`}
            className="w-full rounded-lg border border-line bg-surface p-2 text-sm"
          />
        </div>
      ) : null}
    </li>
  );
}

function Section(props: { title: string; count: number; hint?: string; strong?: boolean; footnote?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between px-2">
        <h3 className={`${HEADING} ${props.strong ? "text-accent" : "text-ink-soft"}`}>
          {props.title} · {props.count}
        </h3>
        {props.hint ? <span className="text-xs text-ink-soft">{props.hint}</span> : null}
      </div>
      <ul className="flex flex-col overflow-hidden rounded-xl bg-surface">{props.children}</ul>
      {props.footnote ? <p className="px-2 text-xs text-ink-soft">{props.footnote}</p> : null}
    </section>
  );
}

/**
 * The review, and after Send the results (TEC-135). Shown in place of the
 * list, with *← Back to the list*. One page, no new route.
 */
export function SendView({ cart }: { cart: CartState }) {
  const review = cart.review ?? [];
  const results = cart.results;
  const byId = new Map(review.map((l) => [l.id, l]));

  if (results) {
    const added = results.outcomes.filter((o) => o.result === "added");
    // **Still on your list**: every line this send left unsent. A line sent before stays sent.
    const left = results.outcomes.filter((o) => o.result !== "added" && byId.get(o.id)?.sent_at === null);
    const defaults = results.outcomes.filter((o) => o.detail.includes("Now your default.")).length;
    return (
      <div className="flex flex-col gap-3">
        <BackLink cart={cart} />
        <div className="flex flex-col gap-1 px-2">
          <h2 className="text-xl font-bold">Send to cart</h2>
          <p className="text-[13px] text-ink-soft">
            Sent {added.length} item{added.length === 1 ? "" : "s"}.{defaults > 0 ? " Defaults saved." : ""} Go to checkout on King Soopers.
          </p>
        </div>
        <section className="flex flex-col gap-1.5">
          <h3 className={`${HEADING} px-2 text-ink-soft`}>{results.summary}</h3>
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
        </section>
        {left.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className={`${HEADING} px-2 text-ink-soft`}>Still on your list · {left.length}</h3>
            <p className="rounded-xl bg-surface px-3.5 py-3 text-sm text-ink-soft">
              {left.map((o) => o.name).join(", ")}. These stay here until you pick or remove them.
            </p>
          </section>
        ) : null}
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper px-4 py-3">
          <a
            href={CHECKOUT_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent text-base font-semibold text-accent-ink"
          >
            Open King Soopers cart
          </a>
        </div>
      </div>
    );
  }

  const pick = review.filter((l) => sectionOf(l) === "pick");
  const goingIn = review.filter((l) => sectionOf(l) === "going");
  const fresh = review.filter((l) => sectionOf(l) === "new");
  const sent = review.filter((l) => sectionOf(l) === "sent");
  const left = review.filter((l) => l.sent_at === null && !cart.going.some((p) => p.id === l.id));
  const row = (l: ReviewLine) => <ReviewRow key={l.id} cart={cart} line={l} />;

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink cart={cart} />
      <div className="flex flex-col gap-1 px-2">
        <h2 className="text-xl font-bold">Send to cart</h2>
        <p className="text-[13px] text-ink-soft">
          {review.length === 0
            ? "Nothing on the list to send — ticked lines are already bought."
            : `${pick.length} to pick · ${cart.going.length} of ${review.length} lines going in`}
        </p>
      </div>

      {pick.length > 0 ? (
        <Section title="Pick one" count={pick.length} hint="most-bought is pre-picked" strong>
          {pick.map(row)}
        </Section>
      ) : null}
      {goingIn.length > 0 ? (
        <Section title="Going in" count={goingIn.length} hint="tap to change">
          {goingIn.map(row)}
        </Section>
      ) : null}
      {fresh.length > 0 ? (
        <Section title="Not saved yet" count={fresh.length} footnote="Ticked items are saved to Your brands when they go in.">
          {fresh.map(row)}
        </Section>
      ) : null}
      {/* **A second send warns and shows what was already sent** (RULES.md). */}
      {sent.length > 0 ? (
        <Section title="Already sent" count={sent.length} hint="the cart only adds">
          {sent.map(row)}
        </Section>
      ) : null}

      {left.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className={`${HEADING} px-2 text-ink-soft`}>Still on your list · {left.length}</h3>
          <p className="rounded-xl bg-surface px-3.5 py-3 text-sm text-ink-soft">
            {left.map((l) => l.name).join(", ")}. These stay here until you pick or remove them.
          </p>
        </section>
      ) : null}

      {cart.refused ? (
        <p role="alert" className="px-2 text-xs text-danger">
          Not sent — already in the cart: {cart.refused.map((l) => l.name).join(", ")}. Tick the box below to send them again.
        </p>
      ) : null}
      {cart.again.length > 0 ? (
        <label className="flex items-center gap-2 px-2 text-xs text-warn">
          <input type="checkbox" checked={cart.confirmAgain} onChange={(e) => cart.setConfirmAgain(e.target.checked)} className="size-4 accent-accent" />
          Yes, add {cart.again.map((l) => l.name).join(", ")} again — the cart only adds, so this doubles them
        </label>
      ) : null}
      {cart.badUrl ? <p className="px-2 text-xs text-danger">A pasted address isn&rsquo;t a King Soopers product page.</p> : null}

      <p className="px-2 text-xs text-ink-soft">
        ★ your default · ✓ the one product saved for that line · other options only when you name them on the line
      </p>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper px-4 py-3">
        <button
          type="button"
          onClick={() => void cart.send()}
          disabled={cart.going.length === 0 || cart.busy !== null || cart.badUrl || (cart.again.length > 0 && !cart.confirmAgain)}
          className="min-h-12 w-full rounded-xl bg-accent text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {cart.busy === "send" ? "Sending…" : `Send ${cart.going.length} to cart`}
        </button>
      </div>
    </div>
  );
}

function BackLink({ cart }: { cart: CartState }) {
  return (
    <div>
      <button type="button" onClick={cart.closeReview} className="inline-block px-2 py-2.5 text-sm text-accent underline-offset-2 hover:underline">
        ← Back to the list
      </button>
    </div>
  );
}
