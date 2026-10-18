import { MACRO_KEYS, MACRO_LABELS, round, type Macros } from "@/lib/macros";

/** One serving's numbers, on a draft and on an open recipe alike. */
export default function MacroRow({ macros, per }: { macros: Macros; per: string }) {
  const m = round(macros);
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {MACRO_KEYS.map((key) => (
        <div key={key} className="flex items-baseline gap-1">
          <dt className="text-ink-soft">{MACRO_LABELS[key]}</dt>
          <dd className="font-medium tabular-nums">
            {m[key]}
            {key === "kcal" ? "" : "g"}
          </dd>
        </div>
      ))}
      <div className="text-ink-soft">{per}</div>
    </dl>
  );
}
