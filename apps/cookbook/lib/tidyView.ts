/**
 * The sentences and small rules on Tidy's screen (TEC-201). Pure, and imported
 * by the browser, so it imports nothing.
 */

/** A servings box's text as a count, or null when it is not a whole number from 1 to 99. */
export function servingsInput(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 99 ? n : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** After the drafts are made: how many, and how many could not be. */
export function tidySummary(made: number, failed: number, stopped: boolean): string {
  const parts = [`${plural(made, "draft")} ready to review`];
  if (failed > 0) parts.push(`${plural(failed, "recipe")} couldn't be tidied and stay as they are`);
  if (stopped) parts.push("stopped early");
  return parts.join(" · ");
}

/** After a Keep: how many were kept, and what still needs the owner. */
export function keepSummary(kept: number, notEstimated: number, failed: number): string {
  const parts = [`${plural(kept, "recipe")} kept`];
  if (notEstimated > 0) parts.push(`${notEstimated} with macros not estimated yet (open the Macros tab to retry)`);
  if (failed > 0) parts.push(`${failed} couldn't be kept and are still drafts`);
  return parts.join(" · ");
}
