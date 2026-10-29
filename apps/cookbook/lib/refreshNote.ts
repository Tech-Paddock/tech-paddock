/**
 * The refresh log's one-line summary (TEC-190): the full report ("Checked 391
 * products at …: 391 updated. Size changed: …") is collapsed behind it and opens
 * on a tap. **No imports**: the browser runs it.
 *
 * Nothing is hidden by the summary: a product Kroger no longer returns, or one
 * that could not be checked, is counted in it, so a partial refresh never reads
 * as a clean one.
 */

export type RefreshCounts = {
  updated: unknown[];
  flagged: unknown[];
  drifted: unknown[];
  failed: unknown[];
};

export function refreshSummary(report: RefreshCounts | null | undefined): { line: string; needsLook: boolean } | null {
  if (!report) return null;
  const checked = report.updated.length + report.flagged.length + report.failed.length;
  if (checked === 0) return { line: "No saved products to check", needsLook: false };
  const n = (k: number, word: string) => `${k} ${word}`;
  const parts = [`Checked ${checked} product${checked === 1 ? "" : "s"}`, n(report.updated.length, "updated")];
  parts.push(`${report.drifted.length} size${report.drifted.length === 1 ? "" : "s"} changed`);
  if (report.flagged.length > 0) parts.push(n(report.flagged.length, "no longer returned"));
  if (report.failed.length > 0) parts.push(n(report.failed.length, "couldn't be checked"));
  return { line: parts.join(" · "), needsLook: report.flagged.length > 0 || report.failed.length > 0 };
}
