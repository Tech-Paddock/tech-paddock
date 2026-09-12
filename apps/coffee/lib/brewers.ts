/**
 * Two brewer vocabularies, deliberately separate.
 *
 * They used to be one list, which conflated two different questions: what the
 * roaster published, and what you own. Narrowing the shared list to the
 * shelf would have been information loss in the roaster's own column — the
 * first three bags in the library are all Sweet Bloom publishing "ORIGAMI
 * AIR", a real dripper that no shared five-item list would have room for.
 *
 * So the roaster's list stays broad and describes the world; yours describes
 * your kitchen. That is the charter's "the roaster's values stay separate
 * from yours", applied to the vocabulary rather than only to the columns.
 */

/** What roasters publish. Broad on purpose — this records the world, not the shelf. */
export const ROASTER_BREWERS = [
  "v60",
  "origami",
  "chemex",
  "kalita",
  "aeropress",
  "french-press",
  "espresso",
  "moka",
  "cold-brew",
  "batch",
  "other",
] as const;

export type RoasterBrewer = (typeof ROASTER_BREWERS)[number];

export const ROASTER_BREWER_LABELS: Record<RoasterBrewer, string> = {
  v60: "V60",
  origami: "Origami",
  chemex: "Chemex",
  kalita: "Kalita Wave",
  aeropress: "AeroPress",
  "french-press": "French press",
  espresso: "Espresso",
  moka: "Moka pot",
  "cold-brew": "Cold brew",
  batch: "Batch brew",
  other: "Other",
};

/** What you actually brew on. */
export const MY_BREWERS = ["v60-02", "v60-switch", "kalita-wave", "cold-brew", "aeropress"] as const;

export type MyBrewer = (typeof MY_BREWERS)[number];

export const MY_BREWER_LABELS: Record<MyBrewer, string> = {
  "v60-02": "V60-02",
  "v60-switch": "V60 Switch",
  "kalita-wave": "Kalita Wave",
  "cold-brew": "Cold brew",
  aeropress: "AeroPress",
};

export function isMyBrewer(value: unknown): value is MyBrewer {
  return typeof value === "string" && (MY_BREWERS as readonly string[]).includes(value);
}

/** Grinders on the shelf. One today; a list because a second one is a data change, not a code change. */
export const GRINDERS = ["Fellow Ode 2"] as const;
export const DEFAULT_GRINDER = "Fellow Ode 2";

/**
 * The roaster's brewer as one of yours, where you own the same thing.
 *
 * Only an exact correspondence counts. Origami, Chemex, espresso and the rest
 * return null rather than being rounded to the nearest thing on the shelf —
 * defaulting you into a brewer you do not own, on the roaster's authority, is
 * the same species of invention this tool refuses everywhere else. A null
 * here means you choose.
 */
export function myBrewerFor(roasterBrewer: string | null | undefined): MyBrewer | null {
  switch (roasterBrewer) {
    case "kalita":
      return "kalita-wave";
    case "aeropress":
      return "aeropress";
    case "cold-brew":
      return "cold-brew";
    // "v60" is deliberately absent: you own two of them and the roaster did
    // not say which, so guessing between 02 and Switch would be inventing.
    default:
      return null;
  }
}
