import Provenance from "./Provenance";
import { MACRO_LABELS, round, type Macros } from "@/lib/macros";
import { calorieSplit, potAndServing, SPLIT_KEYS } from "@/lib/breakdown";
import { perServing, type Recipe } from "@/lib/recipes";

/**
 * One serving's four numbers as tiles: the book's pill and the Macros tab share
 * them, so the two cannot drift apart.
 */
export function MacroTiles({ macros }: { macros: Macros }) {
  const m = round(macros);
  return (
    <span className="grid w-full grid-cols-4 gap-1">
      {(
        [
          ["kcal", String(m.kcal)],
          ["protein", `${m.protein_g}g`],
          ["carbs", `${m.carbs_g}g`],
          ["fat", `${m.fat_g}g`],
        ] as const
      ).map(([k, v]) => (
        <span key={k} className="flex flex-col rounded-lg bg-raised px-2 py-1.5">
          <span className="text-sm font-bold tabular-nums">{v}</span>
          <span className="text-[11px] text-ink-soft">{k}</span>
        </span>
      ))}
    </span>
  );
}

/** The bar's fills, in `SPLIT_KEYS` order; the legend repeats them. Tokens only. */
const SWATCH = ["bg-accent", "bg-accent/50", "bg-ink-soft/60"] as const;

/**
 * **The Macros tab** (TEC-183, replacing TEC-140's Macro breakdown disclosure):
 * one serving's four tiles, the share of calories from protein, carbs and fat,
 * the whole pot on one line, and where the numbers came from. Stored numbers
 * only; nothing is called. Local patterns: the tiles, a thin split bar.
 */
export default function MacroTab({ recipe }: { recipe: Recipe }) {
  const { pot } = potAndServing(recipe);
  const split = calorieSplit(recipe);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-ink-soft">One serving (of {recipe.servings})</p>
        <MacroTiles macros={perServing(recipe)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-ink-soft">Calories from each (approximate, at 4 / 4 / 9 kcal a gram)</p>
        {split ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
              {SPLIT_KEYS.map((key, n) => (
                <span key={key} style={{ width: `${split[key]}%` }} className={SWATCH[n]} />
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

      <p className="text-xs text-ink-soft tabular-nums">
        Whole pot: {pot.kcal} kcal · {pot.protein_g}g protein · {pot.carbs_g}g carbs · {pot.fat_g}g fat
      </p>

      <Provenance source={recipe.source} model={recipe.model} url={recipe.source_url} />
    </div>
  );
}
