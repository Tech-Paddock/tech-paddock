"use client";

/**
 * A treat's amount (TEC-188): a plain whole-number box, 1 or more, in place of the eighths scroller
 * that meals keep. The box holds digits only; an amount the form opened on that is not whole (an
 * older entry) shows as it was until the box is edited. `treatQtyError` (`lib/foods.ts`) is the
 * save-time rule. A local pattern.
 */
export default function TreatQty({
  id,
  label,
  value,
  onChange,
}: {
  id?: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={label}
      value={value === null ? "" : String(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
        onChange(digits === "" ? null : parseInt(digits, 10));
      }}
      onFocus={(e) => e.target.select()}
      className="h-[44px] w-full min-w-0 rounded-[10px] border border-line bg-paper px-2.5 outline-none focus:border-accent"
    />
  );
}
