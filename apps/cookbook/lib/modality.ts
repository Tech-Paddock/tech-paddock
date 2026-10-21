/**
 * Pickup or delivery (TEC-121). **No imports**, because the browser runs it:
 * the list tab's toggle and the server share these words.
 *
 * The choice is remembered on the King Soopers connection
 * (`kroger_connection.modality`). Send passes it to Kroger's cart; the estimate
 * prices only what the chosen mode offers. Checkout still opens the King
 * Soopers cart, where the time slot is chosen.
 */

export const MODALITIES = ["PICKUP", "DELIVERY"] as const;
export type Modality = (typeof MODALITIES)[number];

export const DEFAULT_MODALITY: Modality = "PICKUP";

export function isModality(value: unknown): value is Modality {
  return typeof value === "string" && (MODALITIES as readonly string[]).includes(value);
}

/** The word on the toggle and in sentences: "pickup", "delivery". */
export function modalityWord(modality: Modality): string {
  return modality === "PICKUP" ? "pickup" : "delivery";
}
