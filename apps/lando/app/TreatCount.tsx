"use client";

/**
 * A treat count (TEC-199): "Treats" with − and + around the number, nothing to pick. Wherever a treat is logged
 * from another form (Potty, Training, Fun) the type of treat is dropped and only how many is kept; a count above
 * 0 is saved as its own treat entry, item Misc, amount = the count, once the form's own entry is saved
 * (`inlineTreatEntries`, `lib/events.ts`). It opens on 0, which logs nothing.
 *
 * The plain counter (TEC-250, a local pattern): − 0 + with no box or border around the buttons, in the accent
 * ink. Each button is still a 44px hit area; only the sign looks small.
 */
export const TREAT_COUNT_MAX = 99;

export default function TreatCount({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step =
    "grid h-[44px] w-[40px] shrink-0 place-items-center rounded-[10px] text-[22px] font-semibold leading-none text-accent disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-pinstripe";
  return (
    <div role="group" aria-label="Treats" className="flex items-center">
      <span className="mr-1 text-[15px] text-ink-soft">Treats</span>
      <button type="button" aria-label="One fewer treat" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className={step}>
        −
      </button>
      <output aria-live="polite" aria-label="Treat count" className="min-w-[2ch] text-center text-[17px] font-semibold tabular-nums">
        {value}
      </output>
      <button type="button" aria-label="One more treat" disabled={value >= TREAT_COUNT_MAX} onClick={() => onChange(Math.min(TREAT_COUNT_MAX, value + 1))} className={step}>
        +
      </button>
    </div>
  );
}
