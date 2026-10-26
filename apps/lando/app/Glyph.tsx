import type { MarkKind } from "@/lib/analytics";

/**
 * The mark for each kind of entry on Analytics (TEC-143), a local pattern: a
 * distinct shape per kind so colour is never the only cue. Pee a circle, poop
 * a square, accident a triangle, meal a diamond, treat a plus. Colours are the
 * `--lando-series-*` tokens (globals.css); an accident is the theme's danger.
 * Each shape has a hairline of the card's surface colour so marks that touch
 * stay apart in light and dark.
 */
export const GLYPH_COLOR: Record<MarkKind, string> = {
  pee: "var(--lando-series-1)",
  poop: "var(--lando-series-3)",
  accident: "rgb(var(--danger-rgb))",
  meal: "var(--lando-series-2)",
  treat: "var(--lando-series-2)",
};

export default function Glyph({ kind, size = 10, ring = false }: { kind: MarkKind; size?: number; ring?: boolean }) {
  const c = GLYPH_COLOR[kind];
  const edge = { stroke: "rgb(var(--surface-rgb))", strokeWidth: 0.8 };
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" className="block overflow-visible">
      {ring && <circle cx={5} cy={5} r={7} fill="none" stroke="rgb(var(--ink-rgb))" strokeWidth={1.2} />}
      {kind === "pee" && <circle cx={5} cy={5} r={4.4} fill={c} {...edge} />}
      {kind === "poop" && <rect x={0.8} y={0.8} width={8.4} height={8.4} rx={1} fill={c} {...edge} />}
      {kind === "accident" && <path d="M5 0.4 L9.7 9.4 L0.3 9.4 Z" fill={c} strokeLinejoin="round" {...edge} />}
      {kind === "meal" && <path d="M5 0.2 L9.8 5 L5 9.8 L0.2 5 Z" fill={c} strokeLinejoin="round" {...edge} />}
      {kind === "treat" && <path d="M5 0.8 V9.2 M0.8 5 H9.2" stroke={c} strokeWidth={2.6} strokeLinecap="round" />}
    </svg>
  );
}
