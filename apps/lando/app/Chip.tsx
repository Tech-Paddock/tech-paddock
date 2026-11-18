"use client";

/**
 * One chip of a row of choices that are buttons, not radios (the Time pop-up's shortcuts, the length-of-time chips):
 * the 44px button is the hit area and its inner span is the chip, as `Seg` draws a radio. `aria-pressed` carries the
 * pick, so the chip fills with the accent when it is on. A local pattern.
 */
export default function Chip({
  pressed,
  disabled = false,
  label,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  /** A name for a screen reader, when the face is shorter than the sense. */
  label?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="group flex min-h-[44px] items-center whitespace-nowrap focus-visible:outline-none"
    >
      <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[15px] tabular-nums group-disabled:line-through group-disabled:opacity-40 group-aria-pressed:border-accent group-aria-pressed:bg-accent group-aria-pressed:text-accent-ink group-focus-visible:outline group-focus-visible:outline-[3px] group-focus-visible:outline-offset-2 group-focus-visible:outline-pinstripe">
        {children}
      </span>
    </button>
  );
}
