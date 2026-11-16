/** Session lengths in minutes, chosen before starting. */
export const LENGTHS_MIN = [1, 3, 5, 10, 15, 20] as const;
export const DEFAULT_LENGTH_MIN = 5;

/** One breath: in for 4 seconds, out for 6. The CSS animation is the same ten seconds. */
export const IN_SECONDS = 4;
export const OUT_SECONDS = 6;
export const BREATH_SECONDS = IN_SECONDS + OUT_SECONDS;

export type Breath = { phase: "in" | "out"; count: number; word: string };

/** Where in the breath an elapsed time falls: the text count shown under reduced motion. */
export function breathAt(elapsedSeconds: number): Breath {
  const t = Math.max(0, Math.floor(elapsedSeconds)) % BREATH_SECONDS;
  if (t < IN_SECONDS) return { phase: "in", count: t + 1, word: "Breathe in" };
  return { phase: "out", count: t - IN_SECONDS + 1, word: "Breathe out" };
}

/** Time left on a timer that began at `startedAt`, from timestamps and not ticks, so a throttled tab still ends on time. */
export function remainingSeconds(startedAt: number, plannedSeconds: number, now: number): number {
  return Math.max(0, Math.ceil(plannedSeconds - (now - startedAt) / 1000));
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
