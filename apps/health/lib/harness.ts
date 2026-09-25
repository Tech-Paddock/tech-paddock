import { agrees, disagreements, type Macros } from "./macros";

/**
 * What one debug run found, decided in one place and tested.
 *
 * **The question is whether each model reproduces the number already in your
 * log** ("Health — plan", *It must be able to bypass the cache*), not only
 * whether the two models agree with each other. So agreement is judged per
 * pair, and a choice is put to you only when there is a real disagreement:
 *
 * - With a stored number, you are asked when either model differs from it.
 * - Without one, there is nothing to reproduce, so you are asked when the two
 *   models differ from each other.
 *
 * A side that failed agrees with nothing — a failure is never a match — and is
 * not a disagreement to arbitrate either; the screen names it as a failure.
 */

export type RunSide = { macros: Macros } | { error: string };

export type Judgement = {
  /** Haiku against Sonnet. False when either failed. */
  agreed: boolean;
  /** Null when there was no stored number or that side failed. */
  haikuVsBaseline: boolean | null;
  sonnetVsBaseline: boolean | null;
  /** True when the screen should ask for a pick. */
  needsPick: boolean;
  /** Which fields differ, per pair, for a screen that should say what differs. */
  differs: { models: (keyof Macros)[]; haiku: (keyof Macros)[]; sonnet: (keyof Macros)[] };
  /** Sides that failed, by name, so the screen says which rather than "disagree on ." */
  failed: ("haiku" | "sonnet")[];
};

const ok = (s: RunSide): s is { macros: Macros } => "macros" in s;

export function judge(baseline: Macros | null, haiku: RunSide, sonnet: RunSide): Judgement {
  const failed = [
    ...(ok(haiku) ? [] : ["haiku" as const]),
    ...(ok(sonnet) ? [] : ["sonnet" as const]),
  ];

  const agreed = ok(haiku) && ok(sonnet) && agrees(haiku.macros, sonnet.macros);
  const haikuVsBaseline = baseline && ok(haiku) ? agrees(haiku.macros, baseline) : null;
  const sonnetVsBaseline = baseline && ok(sonnet) ? agrees(sonnet.macros, baseline) : null;

  // A failed side is not a disagreement to arbitrate; it is shown as a failure.
  const needsPick = baseline
    ? haikuVsBaseline === false || sonnetVsBaseline === false
    : ok(haiku) && ok(sonnet) && !agreed;

  return {
    agreed,
    haikuVsBaseline,
    sonnetVsBaseline,
    needsPick,
    differs: {
      models: ok(haiku) && ok(sonnet) ? disagreements(haiku.macros, sonnet.macros) : [],
      haiku: baseline && ok(haiku) ? disagreements(haiku.macros, baseline) : [],
      sonnet: baseline && ok(sonnet) ? disagreements(sonnet.macros, baseline) : [],
    },
    failed,
  };
}
