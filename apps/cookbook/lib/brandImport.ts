import { readBatch } from "./brandBatch";
import { readProducts, saveProduct } from "./productStore";
import { savePreference } from "./preferences";

export type ImportOutcome = { saved: number; rejected: { row: number; reason: string }[] };

/**
 * Write the rows a Paste a batch review ticked (TEC-131; format in NOTES.md).
 *
 * **Nothing saved is changed unless its row says `replace: true`** — the
 * review's tick. A saved product's names are added to, never replaced, and its
 * size first bought is filled only when empty. **A row the database refuses is
 * reported and the rest still land**, so a partial import can be read rather
 * than guessed at. Products are read once; later rows see earlier ones.
 */
export async function importBatch(rows: unknown[]): Promise<ImportOutcome> {
  const { entries, refused } = readBatch(rows);
  const rejected = refused.map((r) => ({ row: r.row, reason: r.reason }));
  const known = entries.some((e) => e.kind === "product") ? await readProducts() : [];
  let saved = 0;

  for (const e of entries) {
    try {
      if (e.kind === "product") {
        const written = await saveProduct(e.draft, { known, mode: "merge", refuseOverwrite: !e.replace });
        const at = known.findIndex((p) => p.id === written.id);
        if (at === -1) known.push(written);
        else known[at] = written;
      } else {
        await savePreference(e.draft, { refuseOverwrite: !e.replace });
      }
      saved++;
    } catch (err) {
      rejected.push({ row: e.row, reason: err instanceof Error ? err.message : "The database refused it." });
    }
  }
  return { saved, rejected: rejected.sort((a, b) => a.row - b.row) };
}
