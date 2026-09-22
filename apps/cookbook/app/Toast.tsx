"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Toasts — what a result says, briefly, and then gets out of the way.
 *
 * **Joel on 2026-09-22: banners should be toasts, not permanent.** A notice like
 * "Green bean is in the book" sat above the tabs until the next action replaced
 * it, pushing the page down by a box that had already been read.
 *
 * **Two lifetimes, because the two kinds are not equally skippable.** A notice
 * confirms something you just watched happen, so four seconds is plenty. An
 * error is the only word you get on why something did not happen, so it stays
 * twice as long and can be dismissed by hand — gone before you look is the one
 * way a toast is worse than the banner it replaced.
 *
 * **A failed read is not a toast.** "Couldn't read the book" describes the page's
 * state, not an event, and it has to stay as long as that state does. The book
 * and the list keep an inline line for that case; this is for everything else.
 */

type Kind = "notice" | "error";
type Toast = { id: number; kind: Kind; text: string };

const LIFETIME: Record<Kind, number> = { notice: 4000, error: 8000 };

const ToastContext = createContext<(kind: Kind, text: string) => void>(() => {});

export function useToast() {
  const push = useContext(ToastContext);
  return {
    notice: (text: string) => push("notice", text),
    error: (text: string) => push("error", text),
  };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: Kind, text: string) => {
    const id = next.current++;
    // Three at most: a burst of failures should not stack up the screen.
    setToasts((current) => [...current.slice(-2), { id, kind, text }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Pinned to the bottom, clear of the home indicator, because the top of
          this page is the bar and the tabs — the two things you tap next. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // The latest callback in a ref, so a new toast arriving (which re-renders
  // every sibling) does not restart this one's clock.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), LIFETIME[toast.kind]);
    return () => clearTimeout(timer);
  }, [toast.kind]);

  const isError = toast.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
        isError ? "border-danger/60 bg-surface text-danger" : "border-line bg-bar text-bar-ink"
      }`}
    >
      <span className="min-w-0 flex-1">{toast.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 leading-none opacity-70 hover:opacity-100"
      >
        {"×"}
      </button>
    </div>
  );
}
