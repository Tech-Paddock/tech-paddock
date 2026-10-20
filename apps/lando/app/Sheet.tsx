"use client";

import { useEffect, useRef } from "react";

/**
 * A bottom sheet: a scrim and a panel sliding up from the bottom edge, for one
 * form at a time. A local pattern (no other app has one).
 *
 * Escape and a tap on the scrim close it unless `onClose` is omitted (the
 * first-open "Whose phone is this?" question must be answered). Focus moves
 * into the sheet on open and back to whatever opened it on close.
 */
export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
    first?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
    // Once per mount: onClose changing identity must not move focus again.
  }, []); // react-hooks/exhaustive-deps: deliberate

  return (
    <>
      <div className="fixed inset-0 z-20 bg-bar/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="lando-sheet fixed inset-x-0 bottom-0 z-30 max-h-[88dvh] overflow-y-auto rounded-t-[18px] border-t-4 border-pinstripe bg-surface px-4 pt-4 outline-none"
        style={{
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3.5">
          <header className="flex items-center justify-between gap-3">
            <h3 id="sheet-title" className="text-[22px] font-bold leading-tight">
              {title}
            </h3>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised text-ink"
              >
                ✕
              </button>
            )}
          </header>
          {children}
        </div>
      </div>
    </>
  );
}
