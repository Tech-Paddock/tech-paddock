import { permanentRedirect } from "next/navigation";

/**
 * The grocery list moved to the Cookbook (TEC-15): you shop from recipes, not
 * from what you ate. This path stays only so an old bookmark lands on the list
 * rather than a 404.
 *
 * **The target is Cookbook's `/list` (TEC-22), exactly** — Cookbook's route
 * says Health depends on it and it is not renamed quietly. It is a fixed
 * origin, never one read from the request. Health no longer reads or writes
 * `health.grocery_items`; the table is dropped by a separate migration once
 * this is live.
 */
const COOKBOOK_LIST_URL = "https://cookbook.techpaddock.io/list";

export default function Page(): never {
  permanentRedirect(COOKBOOK_LIST_URL);
}
