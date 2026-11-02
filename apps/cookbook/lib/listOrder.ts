/**
 * **Ticked lines go to the bottom** (TEC-206; owner, 2026-11-02). Unticked
 * lines keep their order on top; a ticked line keeps its order among the
 * ticked. Unticking moves it back up to where the list's own order puts it.
 * Stable, and it never changes the array it is given.
 */
export function tickedLast<T extends { checked: boolean }>(lines: T[]): T[] {
  return [...lines.filter((l) => !l.checked), ...lines.filter((l) => l.checked)];
}
