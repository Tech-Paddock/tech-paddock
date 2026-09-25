import type { PitItem, PitSource, PitState } from "./pitwall";

/**
 * The Pit Wall's filter. Client-side, because the whole set is already on the
 * page — narrowing it must never mean another round trip. Its own module so the
 * client component imports this and nothing that fetches.
 */
export function filterItems(
  items: PitItem[],
  f: { state: "" | PitState; source: "" | PitSource; agent: string },
): PitItem[] {
  return items.filter(
    (i) =>
      (!f.state || i.state === f.state) &&
      (!f.source || i.source === f.source) &&
      (!f.agent || i.agent === f.agent),
  );
}
