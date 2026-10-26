import Provenance from "./Provenance";
import { MACRO_LABELS } from "@/lib/macros";
import { calorieSplit, potAndServing, SPLIT_KEYS } from "@/lib/breakdown";
import type { Recipe } from "@/lib/recipes";

/**
 * **Macro breakdown** on an open recipe (TEC-140, owner: "Totals and split"),
 * collapsed by default so the recipe itself leads. The whole pot and one
 * serving side by side, the share of calories from each macro, and where the
 * numbers came from. Stored numbers only; nothing is called.
 *
 * A local pattern: a native `<details>` with the summary styled like the
 * uppercase section headings of TEC-135, and a small table.
 */
/** The bar's fills, in `SPLIT_KEYS` order; the legend repeats them. Tokens only. */
const SWATCH = ["bg-accent", "bg-accent/50", "bg-ink-soft/60"] as const;

export default function MacroBreakdown({ recipe }: { recipe: Recipe }) {
  const { pot, serving } = potAndServing(recipe);
  const split = calorieSplit(recipe);
  const rows = (["kcal", ...SPLIT_KEYS] as const).map((key) => ({
    key,
    label: MACRO_LABELS[key],
    unit: key === "kcal" ? "" : "g",
  }));

  return (
    <details className="group rounded-lg bg-raised">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-soft [&::-webkit-details-marker]:hidden">
        <span>Macro breakdown</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-ink-soft">
              <th scope="col" className="py-1 text-left font-medium">
                <span className="sr-only">Macro</span>
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Whole pot
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Per serving <span className="font-normal">(of {recipe.servings})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, unit }) => (
              <tr key={key} className="border-t border-line/40">
                <th scope="row" className="py-1.5 text-left font-normal text-ink-soft">
                  {label}
                </th>
                <td className="py-1.5 text-right">
                  {pot[key]}
                  {unit}
                </td>
                <td className="py-1.5 text-right font-semibold">
                  {serving[key]}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-ink-soft">Calories from each (approximate, at 4 / 4 / 9 kcal a gram)</p>
          {split ? (
            <>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
                {SPLIT_KEYS.map((key, n) => (
                  <span
                    key={key}
                    style={{ width: `${split[key]}%` }}
                    className={SWATCH[n]}
                  />
                ))}
              </div>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {SPLIT_KEYS.map((key, n) => (
                  <div key={key} className="flex items-center gap-1">
                    <dt className="flex items-center gap-1 text-ink-soft">
                      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${SWATCH[n]}`} />
                      {MACRO_LABELS[key]}
                    </dt>
                    <dd className="font-medium tabular-nums">{split[key]}%</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-xs text-ink-soft">No protein, carbs or fat to split.</p>
          )}
        </div>

        <Provenance source={recipe.source} model={recipe.model} url={recipe.source_url} />
      </div>
    </details>
  );
}
