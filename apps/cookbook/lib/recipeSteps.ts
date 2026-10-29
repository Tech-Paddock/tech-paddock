import type { Macros } from "./macros";

/**
 * The recipe helpers the browser runs: **pure, and no imports beyond types**, so a
 * client component can take them without pulling `./supabase` into its bundle.
 * `lib/recipes.ts` re-exports both, so the server side and the tests read them
 * from there as before.
 */

/** One serving: the pot divided by how many it feeds. */
export function perServing(recipe: { servings: number } & Macros): Macros {
  // Guarding the divisor rather than trusting it. `validateDraft` refuses a
  // nonsense serving count before it can be stored, but a draft is rendered the
  // moment it comes back from a model — and Infinity on a screen is worse than a
  // wrong number, because it is not even readable as wrong.
  const n = recipe.servings > 0 ? recipe.servings : 1;
  return {
    kcal: recipe.kcal / n,
    protein_g: recipe.protein_g / n,
    carbs_g: recipe.carbs_g / n,
    fat_g: recipe.fat_g / n,
  };
}

/**
 * A method as the lines you actually follow at the worktop.
 *
 * **The renderer already honoured newlines; the model was the one running the
 * steps together.** Fixing the prompt alone would have looked like a fix and
 * left every recipe already in the book as one wall of text, so the split
 * happens here, on the way to the screen, where it repairs the old rows too.
 *
 * **Split on step markers, never on sentences.** "Add the stock. Simmer." is one
 * instruction in two sentences as often as it is two steps, and there is no way
 * to tell from the text. A numbered marker is the author saying where the breaks
 * are, so it is the only thing trusted.
 *
 * **A number is a marker only when nothing but a marker could be there**: at a
 * line start or after a space, followed by `.` or `)`, then a space, then a
 * letter. That is what keeps `1.5 tbsp oil` and `Bake at 180. 20 minutes.` out —
 * both look like markers until the character after the dot is read.
 */
export function methodSteps(method: string | null): string[] {
  if (!method) return [];

  const marker = /(?:^|\s)\d{1,2}[.)]\s+(?=[A-Za-z])/g;
  const text = method.trim();
  if (!text) return [];

  // Existing newlines are the author's own breaks and are always kept. Splitting
  // a line that is already one step is how a tidy list becomes a ragged one.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // **A marker splits only when it is the next number in the run** (TEC-29 item
  // 4). "Heat the oven to gas mark 4. Bake until golden." has a marker by shape
  // and a setting by meaning; what tells them apart is that no step 3 came before
  // it. The run carries across lines, so "1. Chop.\n2. Fry. 3. Serve." still
  // splits at 3. A run starts only at 1 — at a line start, or mid-line when a 2
  // follows it.
  let last = 0;

  const out: string[] = [];
  for (const line of lines) {
    const found = [...line.matchAll(marker)].map((m) => ({
      // The marker may have consumed a leading space; the step starts at the digit.
      at: m.index + (m[0].length - m[0].trimStart().length),
      n: Number.parseInt(m[0].trim(), 10),
    }));

    const cuts: number[] = [];
    found.forEach(({ at, n }, i) => {
      if (at === 0) {
        // The author's own line break already made this a step; it only sets
        // where the run has got to.
        last = n;
        return;
      }
      // Mid-line, a 1 is a step only when a 2 follows it: "Serves 1. Enjoy."
      // ends in a number and starts no run.
      const next = n === 1 ? found[i + 1]?.n === 2 : n === last + 1;
      if (next) {
        cuts.push(at);
        last = n;
      }
    });
    if (cuts.length === 0) {
      out.push(line);
      continue;
    }
    let from = 0;
    for (const at of cuts) {
      const piece = line.slice(from, at).trim();
      if (piece) out.push(piece);
      from = at;
    }
    const tail = line.slice(from).trim();
    if (tail) out.push(tail);
  }

  return out;
}
