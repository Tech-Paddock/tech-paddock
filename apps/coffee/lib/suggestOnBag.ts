import { suggestRecipe } from "./anthropic";
import { suggestionColumns, type Suggestion } from "./suggestion";
import { getServiceClient } from "./supabase";

/**
 * Generate a suggestion for one bag and write it to that bag's row.
 *
 * Server-side and apart from `lib/suggestion.ts` on purpose: that file is pure
 * and the page imports its types, so pulling the Anthropic SDK into it would
 * put the SDK in the browser bundle. `lib/models.ts` is split from
 * `lib/anthropic.ts` for the same reason.
 *
 * Two callers, one copy: the search route runs this automatically when a
 * search comes back with nothing, and `/api/bags/[id]/suggest` runs it on
 * demand for a bag that was saved before this existed. Two copies of the
 * write would be two places for the columns to drift.
 *
 * **The answer lands on the row, not in the response.** Same reasoning as the
 * search itself — by the time this finishes the page that asked may be gone,
 * and the page reads the row back either way.
 */
export async function suggestOnBag(
  bagId: string,
  bag: { roaster: string; coffee_name: string; origin?: string | null; process?: string | null; varietal?: string | null; roast_date?: string | null }
): Promise<{ suggestion: Suggestion | null; error: string | null }> {
  let suggestion: Suggestion | null = null;
  let error: string | null = null;

  try {
    suggestion = await suggestRecipe({
      roaster: bag.roaster,
      coffeeName: bag.coffee_name,
      origin: bag.origin,
      process: bag.process,
      varietal: bag.varietal,
      roastDate: bag.roast_date,
    });
    // A model that answered with nothing usable is a failure worth saying out
    // loud rather than a bag that silently has no suggestion. The two are the
    // same null in the column, and only one of them is an answer.
    if (!suggestion) error = "Claude did not return a recipe that could be read.";
  } catch (e) {
    error = e instanceof Error ? e.message : "The suggestion failed.";
  }

  const { error: writeError } = await getServiceClient()
    .from("bags")
    .update(suggestionColumns(suggestion, error))
    .eq("id", bagId);

  // A suggestion that was generated and could not be stored is not a
  // suggestion. Reporting it as one would show the page something the row
  // does not have, which survives exactly until the next reload.
  if (writeError) return { suggestion: null, error: writeError.message };

  return { suggestion, error };
}
