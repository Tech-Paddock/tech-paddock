"use client";

import { picklist, findFood, unitLabel, type AddedFood } from "@/lib/foods";
import TreatQty from "./TreatQty";

/**
 * The inline treat row on Potty and Training (TEC-193): which treat (the code list plus foods added in the
 * app) beside how many. It opens on 0, which logs nothing; a treat above 0 is saved as its own entry once
 * the form's own entry is (`inlineTreatEntries`, `lib/events.ts`). One component for both forms. A local
 * pattern.
 */
export default function TreatRow({
  foods,
  item,
  qty,
  onItem,
  onQty,
}: {
  foods: AddedFood[];
  item: string;
  qty: number | null;
  onItem: (id: string) => void;
  onQty: (n: number | null) => void;
}) {
  const food = findFood("treat", item, foods);
  const unit = food?.unit ? unitLabel(food.unit, qty ?? 2) : null;
  const label = "text-xs uppercase tracking-[0.06em] text-ink-soft";
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-2">
      <div className="grid min-w-0 gap-1">
        <label htmlFor="f-treat-item" className={label}>
          Treat
        </label>
        <select
          id="f-treat-item"
          value={item}
          onChange={(e) => onItem(e.target.value)}
          className="w-full min-w-0 rounded-[10px] border border-line bg-paper px-2.5 py-2.5 outline-none focus:border-accent"
        >
          {picklist("treat", foods).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-w-0 gap-1">
        <label htmlFor="f-treat-qty" className={label}>
          {unit ? `Qty (${unit})` : "Qty"}
        </label>
        <TreatQty id="f-treat-qty" label={unit ? `Treat quantity in ${unit}` : "Treat quantity"} value={qty} onChange={onQty} />
      </div>
    </div>
  );
}
