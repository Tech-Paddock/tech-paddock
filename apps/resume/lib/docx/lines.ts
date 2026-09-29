/**
 * Two questions about a single line of text, asked in more than one place.
 *
 * They lived in `label.ts`, the old paragraph labeller, which went with the
 * spec-based renderer (TEC-63). These two outlived it because the live engine
 * and the content check still ask them, and they must keep answering the same
 * way everywhere they are asked.
 */

/** Whether a line is the contact line: an address, a run of separators, or a
 *  LinkedIn link. The renderer uses it to keep the name and contact block out of
 *  the summary. */
export const looksLikeContact = (t: string) =>
  /@/.test(t) || (t.match(/[|·]/g) ?? []).length >= 2 || /linkedin\.com/i.test(t);

const isPipeRow = (text: string) => /^\|.*\|$/.test(text.trim());
const splitCells = (text: string) =>
  text.trim().slice(1, -1).split("|").map((c) => c.trim());

/**
 * `:---`, `---`, `:---:` — markdown's column alignment row.
 *
 * Jobright pastes Career Highlights in as a markdown table, and this row is
 * scaffolding carrying no words, so the content check counts it as neither
 * present nor missing — a number on text no document ever had would be a lie
 * either way. The pipe-row guard keeps an ordinary line with dashes in it from
 * being read as one.
 */
export const isAlignmentRow = (text: string) => {
  if (!isPipeRow(text)) return false;
  const cells = splitCells(text);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
};
