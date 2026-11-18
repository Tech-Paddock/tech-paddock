"use client";

import { useEffect, useId, useRef, useState } from "react";
import { input } from "./fields";

export type MenuOption<T extends string | number> = { value: T; text: string; disabled?: boolean };

/** Rows in the open menu: five of them and a little of the sixth, so it reads as a list that scrolls. */
const ROW = 44;
const MENU_MAX = Math.round(ROW * 4.5);

/**
 * Lando's own compact menu (owner, #73, "Yes compact menu"), in place of a native `<select>`: on iPhone the system menu is
 * huge and the page can't size it. The box looks like the app's other 44px boxes. Tapping it opens a short list right under
 * it, about five rows tall, which scrolls inside itself and never the page (`overscroll-behavior: contain`, `select-none`);
 * the current value is ticked and scrolled into view, a tap picks and closes, and Escape or a tap outside closes. From the
 * keyboard: ArrowDown or ArrowUp opens it, then the arrows, Home, End and Enter move and pick (listbox and option roles). An
 * option may be `disabled` (greyed, never picked). The options hold their own text, so a value off the usual grid (a :34
 * minute on an old entry) is simply one more row. A local pattern.
 */
export default function CompactMenu<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className = "w-[64px]",
}: {
  /** The box's accessible name, and the list's ("Hour"). */
  label: string;
  value: T;
  options: readonly MenuOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const box = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = Math.max(0, options.findIndex((o) => o.value === value));
  const face = options[chosen]?.text ?? String(value);

  function show() {
    setActive(chosen);
    setOpen(true);
  }
  function close(refocus = true) {
    setOpen(false);
    if (refocus) box.current?.focus({ preventScroll: true });
  }
  function pick(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close();
  }
  /** The next row that can be picked, from `from` in `by` steps of one; `from` itself when nothing else can. */
  function move(from: number, by: 1 | -1): number {
    for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i].disabled) return i;
    return from;
  }

  // Opening: the list takes focus and the ticked row is brought to the middle of it (the list's own scroll, never the page's).
  useEffect(() => {
    if (!open) return;
    const ul = list.current;
    if (!ul) return;
    ul.focus({ preventScroll: true });
    const row = ul.children[chosen] as HTMLElement | undefined;
    if (row) ul.scrollTop = Math.max(0, row.offsetTop - ul.clientHeight / 2 + row.offsetHeight / 2);
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape (kept from the pop-up around it, which would cancel the whole Time) and a tap outside close it.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    const away = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", away, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The row the arrows are on stays in view.
  useEffect(() => {
    if (!open) return;
    const ul = list.current;
    const row = ul?.children[active] as HTMLElement | undefined;
    if (!ul || !row) return;
    if (row.offsetTop < ul.scrollTop) ul.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = row.offsetTop + row.offsetHeight - ul.clientHeight;
  }, [active, open]);

  function onKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => move(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => move(a, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(options[0]?.disabled ? move(0, 1) : 0);
        break;
      case "End":
        e.preventDefault();
        setActive(options[options.length - 1]?.disabled ? move(options.length - 1, -1) : options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={box}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
        className={`${input} flex select-none items-center justify-center gap-1 tabular-nums ${className}`}
      >
        <span>{face}</span>
        <span aria-hidden="true" className="text-[11px] text-ink-soft">
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onKey}
          style={{ maxHeight: MENU_MAX, overscrollBehavior: "contain" }}
          className="absolute left-0 top-full z-10 mt-1 w-full min-w-[72px] select-none overflow-y-auto rounded-[10px] border border-line bg-surface py-0.5 shadow-[0_8px_24px_rgb(0_0_0_/_0.3)] outline-none"
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === chosen}
              aria-disabled={o.disabled || undefined}
              onClick={() => pick(i)}
              onPointerEnter={() => !o.disabled && setActive(i)}
              style={{ minHeight: ROW }}
              className={`flex cursor-pointer items-center justify-between gap-1 px-2.5 text-[15px] tabular-nums ${
                o.disabled ? "line-through opacity-40" : i === active ? "bg-raised" : ""
              } ${i === chosen ? "font-bold" : ""}`}
            >
              <span>{o.text}</span>
              <span aria-hidden="true" className="text-accent">
                {i === chosen ? "✓" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
