import type { ReactNode } from "react";

/**
 * **The one search / add field** (TEC-236, the owner's demo of 2026-11-08): a rounded field with
 * its icon inside, ringed in the accent when you tap in. A plus for adding and a magnifier for
 * searching; nothing else frames it. It wraps the control (an input, or the List's growing textarea)
 * and any button that sits at its right end, so the whole field is the focus target. A local
 * pattern; tokens only (`.field-shadow` is in `globals.css`).
 */
export function SearchField(props: { icon: "add" | "search"; label?: string; children: ReactNode }) {
  return (
    <div
      role={props.label ? "group" : undefined}
      aria-label={props.label}
      className="field-shadow flex items-center gap-2 rounded-[26px] border-[1.5px] border-line/60 bg-surface py-1 pl-3.5 pr-1 transition-colors focus-within:border-accent"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={props.icon === "add" ? 2.6 : 2.4}
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0 text-accent"
      >
        {props.icon === "add" ? (
          <path d="M12 5v14M5 12h14" />
        ) : (
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </>
        )}
      </svg>
      {props.children}
    </div>
  );
}

/** The control's own classes: no border or ring (the field draws them), a quiet placeholder. */
export const FIELD_CONTROL = "min-h-10 min-w-0 flex-1 bg-transparent text-base leading-snug text-ink outline-none placeholder:text-ink-soft";
