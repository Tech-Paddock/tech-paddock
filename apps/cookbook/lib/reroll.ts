import { META_JSON_HINT } from "./metadata";
import { NO_PICKS, picksPrompt, type Picks } from "./tuning";

/**
 * "Something else" — asking Claude again, with what was already turned down
 * (TEC-39 D, agreed with Joel 2026-09-24).
 *
 * **The problem it fixes.** Joel asked for a side and got a green bean dish,
 * asked for "not green beans" and got the same dish with asparagus. Generating
 * sent only the brief, so the model never saw what it had offered. A reroll now
 * sends the brief **plus every draft turned down this session**, name and
 * ingredients, with an instruction to change what the dish is built on and how
 * it is cooked — not to swap a vegetable.
 *
 * Pure, so the prompt and the validation have tests without a model call. The
 * pile itself is the browser's state and is never stored: nothing is saved until
 * Keep it, as for any other draft.
 */

export type TurnedDown = { name: string; ingredients: string[] };

/** How many earlier drafts a reroll carries. Enough for an evening; bounded so a request cannot grow without end. */
export const MAX_TURNED_DOWN = 8;
export const MAX_STEER = 300;

/**
 * Read the turned-down pile off a request body, or say why not. Untrusted: the
 * browser holds it, so it is re-shaped here rather than passed through.
 */
export function readTurnedDown(raw: unknown): { turnedDown: TurnedDown[] } | { error: string } {
  if (raw === undefined || raw === null) return { turnedDown: [] };
  if (!Array.isArray(raw)) return { error: "The drafts to avoid should be a list." };
  if (raw.length > MAX_TURNED_DOWN) {
    return { error: `That is more than ${MAX_TURNED_DOWN} drafts to avoid — start a fresh ask.` };
  }
  const turnedDown: TurnedDown[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as { name?: unknown; ingredients?: unknown };
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 200) : "";
    if (!name) return { error: "A draft to avoid has no name." };
    const ingredients = Array.isArray(o.ingredients)
      ? o.ingredients
          .filter((i): i is string => typeof i === "string")
          .map((i) => i.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 40)
      : [];
    turnedDown.push({ name, ingredients });
  }
  return { turnedDown };
}

/**
 * A draft turned down — by "Something else" or by **Bin it**, which Joel ruled is
 * a turn-down too (2026-09-25: "yes it's a draft turn down"). The pile keeps the
 * newest past the cap, so the latest refusals always travel.
 */
export function turnDown(pile: TurnedDown[], draft: TurnedDown): TurnedDown[] {
  return [...pile, { name: draft.name, ingredients: draft.ingredients }].slice(-MAX_TURNED_DOWN);
}

/**
 * The pile a "Work it out" carries. **A new brief is a fresh ask and starts
 * empty** (Joel, 2026-09-25: keep the reset as it is). The same brief after a
 * Bin it is the same ask, so what was binned is still avoided — otherwise
 * binning would count as a turn-down and then be forgotten on the very next tap.
 */
export function pileForAsk(pile: TurnedDown[], pileBrief: string, brief: string): TurnedDown[] {
  const same = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return same(pileBrief) === same(brief) ? pile : [];
}

/**
 * The user message for a generate call: the brief, the tuning picks as
 * requirements (`lib/tuning.ts`), and on a reroll what to steer away from. A
 * brief may be empty when something is picked — the picks are then the ask.
 */
export function generatePrompt(
  brief: string,
  turnedDown: TurnedDown[] = [],
  steer = "",
  picks: Picks = NO_PICKS
): string {
  const asked = brief.trim();
  const parts = [`What they asked for: ${asked || "anything that meets the requirements below."}`];
  const required = picksPrompt(picks);
  if (required) parts.push(required);

  if (turnedDown.length > 0) {
    parts.push(
      `They have already turned these down:\n` +
        turnedDown
          .map((d, n) => `${n + 1}. ${d.name}${d.ingredients.length ? ` — ${d.ingredients.join("; ")}` : ""}`)
          .join("\n")
    );
    parts.push(
      `Offer something genuinely different from every one of them. **Change what the dish is built on ` +
        `and how it is cooked** — a different main ingredient and a different method — not the same dish ` +
        `with one ingredient swapped. It must still answer what they asked for.`
    );
  }

  const why = steer.trim();
  if (why) parts.push(`Why they turned the last one down: ${why}`);

  parts.push(
    `Return a JSON object: {"name": string, "servings": number, "ingredients": [string], "method": string, ` +
      `${META_JSON_HINT}}. ` +
      `Put nothing after the JSON.`
  );
  return parts.join("\n\n");
}
