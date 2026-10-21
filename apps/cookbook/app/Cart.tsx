"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHECKOUT_URL, isKingSoopersProduct } from "@/lib/kingsoopers";
import { refreshDue, scanDue } from "@/lib/refreshDue";
import type { CartLine, Outcome, ReviewLine } from "@/lib/cart";
import { modalityWord, type Modality } from "@/lib/modality";
import type { Estimate, ScanRecord } from "@/lib/pricing";
import type { SaleSources } from "@/lib/saleTag";
import { describe as describeHeld, type TakeBackLine, type TakeBackOutcome } from "@/lib/takeBack";
import { DealsPanel, EstimatePanel, ModeToggle } from "./Deals";
import { useToast } from "./Toast";

/**
 * Send to cart — King Soopers (TEC-90; `RULES.md`, *Send to cart*).
 *
 * On the list tab, under the list: connect once, pick a store once, then
 * review and send. **Every line is shown before anything is sent**: a line tied
 * to an exact product goes in as-is, any other shows Kroger's top match for a
 * tap, or takes an exact product page instead — remembered in Your brands.
 * **No model picks anything.** Every line then reports added, skipped or failed,
 * and **a line already sent is not sent again without saying so**, because the
 * Cart API only adds. Checkout stays at King Soopers: the link opens their cart.
 *
 * **Refresh** (2026-10-20): opening this tab with the last refresh over a
 * week old starts one in the background; *Refresh now* starts one by hand.
 * Either way the result is said in words, and a failure is never silence.
 *
 * **Prices (TEC-121)**: a Pickup/Delivery toggle (remembered on the
 * connection, passed to Send), *Calculate estimated total*, and the deal scan,
 * which runs on the refresh's rule. **Every request that borrows a Kroger
 * token goes through `serial`**, one at a time: two at once can race the
 * refresh token's rotation, and opening the list can start a refresh and a
 * scan together.
 *
 * **Take back (TEC-127)**: removes what Cookbook sent — the products,
 * quantities and modes the ledger recorded — by negative quantities, after a
 * second tap that shows what will come out. Never says the cart is empty.
 *
 * Local patterns, named so they are a decision deferred rather than drift: the
 * per-line review rows (added / skipped / failed chips, and Take back's taken
 * back / skipped / failed), the Take back confirm and the store picker are this
 * file's own; they reuse the theme's tokens only.
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

/** What the user has decided for one line in the review. */
type Choice = { include: boolean; url: string };

const CALLBACK_WORDS: Record<string, string> = {
  connected: "King Soopers connected.",
  declined: "The Kroger sign-in was cancelled. Nothing was saved.",
  "bad-state": "That sign-in didn't start from this page, so it was refused. Tap Connect King Soopers again.",
  failed: "Kroger didn't complete the sign-in. Nothing was saved — try Connect again.",
  unconfigured: "Send to cart isn't set up on this deployment.",
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CheckoutLink() {
  return (
    <a
      href={CHECKOUT_URL}
      target="_blank"
      rel="noreferrer"
      className="rounded border border-line px-3 py-1.5 text-sm underline decoration-dotted underline-offset-2"
    >
      Go to checkout
    </a>
  );
}

export default function Cart({
  onBrandsChanged,
  onSaleSources,
}: {
  onBrandsChanged: () => void;
  /** The prices this panel already holds, handed up so the list can tag lines on sale (TEC-121 3a). No request of its own. */
  onSaleSources?: (sources: SaleSources) => void;
}) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // A ref, so a parent re-render (every tick on the list) never re-runs the
  // on-open effect below and re-reads the connection.
  const brandsChanged = useRef(onBrandsChanged);
  brandsChanged.current = onBrandsChanged;

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
  const [confirmAgain, setConfirmAgain] = useState(false);
  const [refused, setRefused] = useState<CartLine[] | null>(null);
  const [results, setResults] = useState<{
    outcomes: Outcome[];
    summary: string;
    recordError: string | null;
    modalityWarning: string | null;
  } | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ text: string; failed: boolean } | null>(null);
  const autoRefreshed = useRef(false);

  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ estimate: Estimate; message: string } | null>(null);

  const [latestScan, setLatestScan] = useState<ScanRecord | null>(null);
  const [scanLoaded, setScanLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<{ text: string; failed: boolean } | null>(null);
  const autoScanned = useRef(false);

  /**
   * **One Kroger request at a time.** Each borrows the refresh token, and two
   * at once can race its rotation (NOTES.md); opening the list can start a
   * refresh and a deal scan together. A failed task does not stop the next.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

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

  // The list's on-sale tags read the latest scan and estimate held here, at
  // the chosen store; nothing new is fetched for them.
  const locationId = status?.connected ? (status.store?.locationId ?? null) : null;
  useEffect(() => {
    onSaleSources?.({ locationId, scan: latestScan, estimate: estimate?.estimate ?? null });
  }, [onSaleSources, locationId, latestScan, estimate]);

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
      // **Exact products start ticked; a match waits for a tap** (RULES.md).
      // A line already sent starts unticked, whatever it is.
      setChoices(
        Object.fromEntries(
          lines.map((l) => [l.id, { include: l.plan.kind === "exact" && l.sent_at === null, url: "" }])
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't get the list ready.");
    } finally {
      setBusy(null);
    }
  }

  function choose(id: string, change: Partial<Choice>) {
    setChoices((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  const picks = (review ?? []).flatMap((line): { id: string; upc?: string; url?: string }[] => {
    const choice = choices[line.id];
    if (!choice) return [];
    if (choice.url.trim()) return [{ id: line.id, url: choice.url.trim() }];
    if (!choice.include) return [];
    if (line.plan.kind === "exact") return [{ id: line.id, upc: line.plan.upc }];
    if (line.plan.kind === "match") return [{ id: line.id, upc: line.plan.product.upc }];
    return [];
  });
  const again = (review ?? []).filter((l) => l.sent_at !== null && picks.some((p) => p.id === l.id));
  const badUrl = (review ?? []).some((l) => {
    const url = choices[l.id]?.url.trim();
    return !!url && !isKingSoopersProduct(url);
  });

  async function send() {
    if (busy || picks.length === 0) return;
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
      setResults({
        outcomes: body.outcomes,
        summary: body.summary,
        recordError: body.recordError ?? null,
        modalityWarning: body.modalityWarning ?? null,
      });
      setReview(null);
      brandsChanged.current();
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
      // What was sent has changed; a review or send result on screen is now stale.
      setReview(null);
      setResults(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't take back from the cart.");
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------------

  let body: ReactNode;
  if (status === null) {
    body = statusError ? (
      <p role="alert" className="text-sm text-danger">{statusError}</p>
    ) : (
      <p className="text-sm text-ink-soft">Checking the King Soopers connection…</p>
    );
  } else if (!status.configured) {
    // **In words, naming the variable** — never a dead button.
    body = (
      <p className="text-sm text-ink-soft">
        Send to cart isn&rsquo;t set up on this deployment: {status.problems.join("; ")}.
      </p>
    );
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
  } else if (!status.store || choosingStore) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">Pick your store once, so matches are priced and stocked there.</p>
        <div className="flex gap-2">
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            placeholder="ZIP"
            aria-label="ZIP code"
            className="w-28 rounded-lg border border-line bg-surface p-2 text-base"
          />
          <button
            type="button"
            onClick={findStores}
            disabled={!/^\d{5}$/.test(zip.trim()) || busy !== null}
            className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {busy === "stores" ? "Looking…" : "Find stores"}
          </button>
          {status.store ? (
            <button type="button" onClick={() => setChoosingStore(false)} className="text-sm text-ink-soft">
              Cancel
            </button>
          ) : null}
        </div>
        {stores !== null ? (
          stores.length === 0 ? (
            <p className="text-sm text-ink-soft">No King Soopers near that ZIP.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {stores.map((s) => (
                <li key={s.locationId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {s.name}
                    <span className="block text-[11px] text-ink-soft">{s.address}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => pickStore(s)}
                    className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs"
                  >
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span>{status.store.name}</span>
          <button type="button" onClick={() => setChoosingStore(true)} className="underline decoration-dotted underline-offset-2">
            change store
          </button>
          <button type="button" onClick={disconnect} className="underline decoration-dotted underline-offset-2">
            disconnect
          </button>
          <span className="ml-auto">
            {status.refreshedAt ? `prices checked ${when(status.refreshedAt)}` : "prices not checked yet"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded border border-line px-2 py-1 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>

        {/* Pickup or Delivery (TEC-121): remembered on the connection; Send
            passes it to the cart and the estimate prices what it offers. */}
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle value={status.modality} onChange={(m) => void chooseModality(m)} disabled={busy === "send" || busy === "take-back"} />
          <span className="text-xs text-ink-soft">The time slot is picked at King Soopers checkout.</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startReview}
            disabled={busy !== null}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy === "review" ? "Looking up…" : review ? "Look up again" : "Send to cart"}
          </button>
          <button
            type="button"
            onClick={() => void calculate()}
            disabled={estimating}
            className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
          >
            {estimating ? "Calculating…" : `Calculate estimated total (${modalityWord(status.modality)})`}
          </button>
          <CheckoutLink />
          {/* **Says it leaves the rest** (RULES.md): Cookbook can only remove what it sent. */}
          <button
            type="button"
            onClick={() => void lookTakeBack()}
            disabled={busy !== null || takeBackPreview !== null}
            className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
          >
            {busy === "take-back-look" ? "Checking…" : "Take back only what Cookbook sent"}
          </button>
        </div>

        {takeBackPreview ? (
          <TakeBackConfirm
            lines={takeBackPreview}
            working={busy === "take-back"}
            onConfirm={() => void confirmTakeBack()}
            onCancel={() => setTakeBackPreview(null)}
          />
        ) : null}

        {takeBackResults ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <h3 className="text-sm font-semibold">{takeBackResults.summary}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {takeBackResults.outcomes.map((o) => (
                <li key={o.id} className="flex items-baseline gap-2">
                  <span
                    className={`shrink-0 rounded border px-1.5 text-[11px] ${
                      o.result === "taken back" ? "border-accent text-accent" : o.result === "failed" ? "border-danger/60 text-danger" : "border-line text-ink-soft"
                    }`}
                  >
                    {o.result}
                  </span>
                  <span className="min-w-0">
                    {o.name} <span className="text-ink-soft">— {o.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {takeBackResults.recordError ? <p className="text-xs text-danger">{takeBackResults.recordError}</p> : null}
            {takeBackResults.failed ? (
              <p role="alert" className="text-xs text-warn">
                Not everything came back out.{" "}
                <a href={CHECKOUT_URL} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                  Open the King Soopers cart
                </a>{" "}
                to remove the rest by hand.
              </p>
            ) : null}
          </div>
        ) : null}

        {estimate ? <EstimatePanel estimate={estimate.estimate} message={estimate.message} onClose={() => setEstimate(null)} /> : null}

        {review ? (
          <ReviewPanel
            review={review}
            choices={choices}
            choose={choose}
            again={again}
            confirmAgain={confirmAgain}
            setConfirmAgain={setConfirmAgain}
            refused={refused}
            badUrl={badUrl}
            count={picks.length}
            sending={busy === "send"}
            onSend={send}
            onCancel={() => setReview(null)}
          />
        ) : null}

        {results ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <h3 className="text-sm font-semibold">{results.summary}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {results.outcomes.map((o) => (
                <li key={o.id} className="flex items-baseline gap-2">
                  <span
                    className={`shrink-0 rounded border px-1.5 text-[11px] ${
                      o.result === "added" ? "border-accent text-accent" : o.result === "failed" ? "border-danger/60 text-danger" : "border-line text-ink-soft"
                    }`}
                  >
                    {o.result}
                  </span>
                  <span className="min-w-0">
                    {o.name} <span className="text-ink-soft">— {o.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {results.modalityWarning ? <p role="alert" className="text-xs text-warn">{results.modalityWarning}</p> : null}
            {results.recordError ? <p className="text-xs text-danger">{results.recordError}</p> : null}
            <div>
              <CheckoutLink />
            </div>
          </div>
        ) : null}

        <DealsPanel latest={latestScan} loaded={scanLoaded} scanning={scanning} note={scanNote} onScan={() => void scan("manual")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <h2 className="text-base font-semibold">Send to cart</h2>
      {body}
      {refreshing && !refreshNote ? <p className="text-xs text-ink-soft">Checking prices and stock in the background…</p> : null}
      {refreshNote ? (
        <p role={refreshNote.failed ? "alert" : undefined} className={`text-xs ${refreshNote.failed ? "text-danger" : "text-ink-soft"}`}>
          {refreshNote.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Take back's confirm (TEC-127): **what will come out, before it does**, and
 * that nothing else in the cart is touched. A local pattern, like the review.
 */
function TakeBackConfirm(props: { lines: TakeBackLine[]; working: boolean; onConfirm: () => void; onCancel: () => void }) {
  const recorded = props.lines.filter((l) => l.held.length > 0);
  const unrecorded = props.lines.filter((l) => l.held.length === 0);

  if (props.lines.length === 0) {
    return (
      <div className="flex items-baseline gap-2 rounded-lg border border-line p-3 text-sm text-ink-soft">
        <span className="flex-1">Cookbook hasn&rsquo;t sent anything on this list to the cart, so there&rsquo;s nothing to take back.</span>
        <button type="button" onClick={props.onCancel} className="text-xs underline decoration-dotted underline-offset-2">
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
          Skipped — sent before Cookbook recorded what went in: {unrecorded.map((l) => l.name).join(", ")}. Remove those on the
          King Soopers cart page.
        </p>
      ) : null}
      <p className="text-xs text-ink-soft">
        Only what Cookbook sent comes out; anything added to the cart elsewhere stays. This can&rsquo;t be undone from here — send
        again to put them back.
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

function ReviewPanel(props: {
  review: ReviewLine[];
  choices: Record<string, Choice>;
  choose: (id: string, change: Partial<Choice>) => void;
  again: ReviewLine[];
  confirmAgain: boolean;
  setConfirmAgain: (v: boolean) => void;
  refused: CartLine[] | null;
  badUrl: boolean;
  count: number;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const { review, choices, choose, again } = props;
  const sentBefore = review.filter((l) => l.sent_at !== null);

  if (review.length === 0) {
    return <p className="text-sm text-ink-soft">Nothing on the list to send — ticked lines are already bought.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent bg-surface p-3">
      {/* **A second send warns and shows what was already sent** (RULES.md). */}
      {sentBefore.length > 0 ? (
        <div className="rounded-lg border border-warn/60 p-2 text-xs">
          <p className="font-semibold text-warn">Already sent — the cart only adds, so sending these again doubles them:</p>
          <ul className="mt-1">
            {sentBefore.map((l) => (
              <li key={l.id}>
                {l.name} ×{l.quantity} <span className="text-ink-soft">— {when(l.sent_at as string)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {review.map((line) => {
          const choice = choices[line.id] ?? { include: false, url: "" };
          const plan = line.plan;
          return (
            <li key={line.id} className="flex flex-col gap-1 py-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1">
                  <b>{line.name}</b> <span className="text-ink-soft">×{line.quantity}</span>
                  {line.note ? <span className="text-ink-soft"> — {line.note}</span> : null}
                </span>
                {plan.kind !== "none" && !choice.url.trim() ? (
                  <label className="flex shrink-0 items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={choice.include}
                      onChange={(e) => choose(line.id, { include: e.target.checked })}
                      className="size-4 accent-accent"
                    />
                    {plan.kind === "exact" ? "Send" : "Add"}
                  </label>
                ) : null}
              </div>

              {plan.kind === "exact" ? (
                <span className="text-xs text-ink-soft">
                  Your brand ({plan.phrase}) —{" "}
                  <a href={plan.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                    the exact product
                  </a>
                  {plan.missing ? <span className="text-danger"> · Kroger stopped returning it at the last refresh</span> : null}
                </span>
              ) : plan.kind === "match" ? (
                <span className="text-xs text-ink-soft">
                  Kroger&rsquo;s top match:{" "}
                  <a href={plan.product.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                    {plan.product.description}
                  </a>
                  {plan.product.size ? ` · ${plan.product.size}` : ""}
                  {plan.product.price !== null ? ` · $${plan.product.price.toFixed(2)}` : ""}
                  {plan.product.inStock === false ? " · out of stock" : ""}
                </span>
              ) : (
                <span className="text-xs text-ink-soft">{plan.reason}</span>
              )}

              {plan.kind !== "exact" ? (
                <input
                  value={choice.url}
                  onChange={(e) => choose(line.id, { url: e.target.value })}
                  placeholder="Or paste the exact product page — it will be remembered"
                  aria-label={`Exact product page for ${line.name}`}
                  className="rounded-lg border border-line bg-surface p-2 text-xs"
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {props.refused ? (
        <p role="alert" className="text-xs text-danger">
          Not sent — already in the cart: {props.refused.map((l) => l.name).join(", ")}. Tick the box below to send them again.
        </p>
      ) : null}

      {again.length > 0 ? (
        <label className="flex items-center gap-2 text-xs text-warn">
          <input
            type="checkbox"
            checked={props.confirmAgain}
            onChange={(e) => props.setConfirmAgain(e.target.checked)}
            className="size-4 accent-accent"
          />
          Yes, add {again.map((l) => l.name).join(", ")} again
        </label>
      ) : null}

      {props.badUrl ? <p className="text-xs text-danger">A pasted address isn&rsquo;t a King Soopers product page.</p> : null}

      <div className="flex gap-2">
        <button type="button" onClick={props.onCancel} className="rounded-lg border border-line px-3 py-2 text-sm">
          Not now
        </button>
        <button
          type="button"
          onClick={props.onSend}
          disabled={props.count === 0 || props.sending || props.badUrl || (again.length > 0 && !props.confirmAgain)}
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {props.sending ? "Sending…" : `Send ${props.count} to the cart`}
        </button>
      </div>
    </div>
  );
}
