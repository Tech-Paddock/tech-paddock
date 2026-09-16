import type { Para } from "./paragraphs";
import { isAlignmentRow } from "./label";

/**
 * How much of the source document's text survived into the finished one.
 *
 * `missing` carries the source line as the source wrote it, never a summary of
 * it — the whole point is to be able to read the line you dropped and put it
 * back.
 */
export type ContentCheck = {
  /** Distinct, non-scaffolding lines of text in the source. */
  totalLines: number;
  present: number;
  /** Source lines the finished document does not wholly account for. */
  missing: string[];
  percent: number;
};

/**
 * Word rewrites typography as you type: straight quotes curl, a double hyphen
 * becomes an en dash, a space before a line break becomes non-breaking. None of
 * that is a dropped word, so it must not read as one. Everything normalised here
 * is a substitution of one character for a typographic equivalent, or a change
 * of case — never a change to which words are present.
 */
const normalize = (s: string) =>
  s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    // Word's autocorrect turns a typed "--" into a single en dash, so the two
    // spellings are the same punctuation and must compare equal. Collapsing a
    // run of hyphens cannot hide a missing word: it only ever removes hyphens.
    .replace(/-{2,}/g, "-")
    .replace(/[   ]/g, " ")
    .toLowerCase()
    .trim();

/**
 * Colons, semicolons and pipes separate words as surely as a space does, and
 * Jobright writes its highlights as "metric:description" with no space at all —
 * which the renderer then splits into two table cells. Splitting on them here
 * costs nothing, because both documents are tokenised the same way.
 *
 * Punctuation clinging to either end of a word is then dropped, because the
 * renderer legitimately rewrites a list's separators to match the template's —
 * "Alpha, Beta" becomes "Alpha · Beta" — and without this the comma stays stuck
 * to "Alpha," and every reformatted list reads as missing. Both documents get
 * the same treatment, and only the edges are touched, so "$250,000" keeps its
 * internal comma and stays distinct from "250".
 */
const tokens = (s: string) =>
  normalize(s)
    .split(/[\s:;|]+/)
    .map((t) => t.replace(/^[("'[•·]+/, "").replace(/[.,;:)"'\]•·]+$/, ""))
    .filter(Boolean);

/**
 * How many of a line's words the finished document accounts for, matching the
 * longest run of consecutive words it can at each step.
 *
 * Runs rather than whole lines, because moving text between two documents
 * legitimately breaks a line up: the renderer splits "metric: description" into
 * two table cells, and a job title gets inserted between an employer and its
 * dates. Every word is still there. Whole-line matching called nine such lines
 * missing out of forty-two on real files — and a report that cries wolf that
 * often is one you learn to ignore, which is the same failure as overstating,
 * pointed the other way.
 *
 * Runs rather than loose words, equally: every word of "Delivered a
 * representative accomplishment" occurs somewhere in a resume full of similar
 * bullets, so counting words independently would report a deleted bullet as
 * present. Only consecutive text counts.
 */
function coveredWords(line: string[], hay: string[], starts: Map<string, number[]>): number {
  let i = 0;
  let covered = 0;
  while (i < line.length) {
    let best = 0;
    for (const start of starts.get(line[i]) ?? []) {
      let n = 0;
      while (i + n < line.length && start + n < hay.length && hay[start + n] === line[i + n]) n += 1;
      if (n > best) best = n;
    }
    // best === 0 means this word occurs nowhere in the finished document.
    if (best === 0) i += 1;
    else {
      covered += best;
      i += best;
    }
  }
  return covered;
}

/**
 * Compare a finished resume against the document its text came from.
 *
 * This is the half no word processor can do for you. Word shows you what the
 * page looks like; it cannot tell you that a bullet you meant to carry across
 * never made it. Jobright's exact wording *is* the ATS keyword optimisation, so
 * a line lost while copying is lost coverage, and nothing about the finished
 * file shows it used to be there.
 *
 * A line counts as present only when every one of its words is accounted for.
 * Anything less is reported, because a report that overstates what the document
 * contains is worse than no report at all: it reads as verified.
 */
export function compareContent(source: Para[], final: Para[]): ContentCheck {
  return compareLines(
    source
      // Scaffolding is tested before normalising: a markdown alignment row
      // carries no words, and normalising collapses the dashes that identify it.
      .filter((p) => p.text.trim() !== "" && !isAlignmentRow(p.text))
      .map((p) => p.text),
    final
  );
}

/**
 * The same check against lines chosen by the caller rather than every paragraph
 * of a document.
 *
 * The renderer deliberately does not carry some of the source across — the name
 * and contact block, and the static Education, Certifications and Hobbies
 * sections, which come from the template on purpose. Comparing against the whole
 * source therefore reports all of them as missing, every time, which is a report
 * that cries wolf about its own design. Handed only the lines the renderer
 * actually took, the question becomes the one worth asking: did everything it
 * took arrive?
 */
export function compareLines(sourceLines: string[], final: Para[]): ContentCheck {
  const hay = tokens(final.map((p) => p.text).join("\n"));
  const starts = new Map<string, number[]>();
  hay.forEach((word, i) => {
    const at = starts.get(word);
    if (at) at.push(i);
    else starts.set(word, [i]);
  });

  // Keyed by the normalised line so a form of words is counted once — counting a
  // duplicate twice would let one genuine miss hide behind a copy of a line that
  // did land — and valued by the original, so what gets reported back is the
  // text as the source actually wrote it and not this function's idea of it.
  const lines = new Map<string, string>();
  for (const text of sourceLines) {
    if (text.trim() === "") continue;
    const key = normalize(text);
    if (key !== "" && !lines.has(key)) lines.set(key, text.trim());
  }

  const missing = [...lines]
    .filter(([key]) => {
      const words = tokens(key);
      return coveredWords(words, hay, starts) < words.length;
    })
    .map(([, original]) => original);

  const present = lines.size - missing.length;
  return {
    totalLines: lines.size,
    present,
    missing,
    percent: lines.size === 0 ? 100 : Math.round((present / lines.size) * 1000) / 10,
  };
}
