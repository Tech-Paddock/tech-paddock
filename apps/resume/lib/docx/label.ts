import type { Para } from "./paragraphs";

export type Entry = { company: string; title: string | null; dates: string | null; bullets: string[] };
export type Highlight = { metric: string; description: string };

export type Section =
  | { kind: "prose"; label: string; body: string }
  | { kind: "bullets"; label: string; items: string[] }
  | { kind: "entries"; label: string; entries: Entry[] }
  | { kind: "highlights"; label: string; items: Highlight[] };

export type ResumeContent = {
  name: string | null;
  contact: string | null;
  sections: Section[];
};

export type Coverage = {
  totalParagraphs: number;
  placed: number;
  /** Source text that reached no section. Surfaced in the UI, never swallowed. */
  dropped: string[];
  percent: number;
};

const DATE_RANGE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4})\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|Present|Current|\d{4})/i;

const looksLikeContact = (t: string) =>
  /@/.test(t) || (t.match(/[|·]/g) ?? []).length >= 2 || /linkedin\.com/i.test(t);

/**
 * Turn paragraphs into structured content, deterministically.
 *
 * Text is only ever moved, never rewritten — every string here comes straight
 * from the document. Anything the rules cannot place is reported in `dropped`
 * rather than discarded, because Jobright's exact wording is the ATS
 * optimisation and a silently missing line is lost keyword coverage.
 */
export function labelParagraphs(paras: Para[]): { content: ResumeContent; coverage: Coverage } {
  const withText = paras.filter((p) => p.text.trim());
  const prose = withText.filter((p) => !p.inTable && !p.listId);
  const ranks = [...new Set(prose.map((p) => p.size).filter((s): s is number => s !== null))].sort((a, b) => b - a);
  const [nameSize, headingSize, entrySize] = ranks;

  const content: ResumeContent = { name: null, contact: null, sections: [] };
  const placed = new Set<number>();
  let current: { label: string; members: Para[] } | null = null;
  const groups: { label: string; members: Para[] }[] = [];

  for (const p of withText) {
    const text = p.text.trim();

    if (content.name === null && nameSize !== undefined && p.size === nameSize && !p.inTable && !p.listId) {
      content.name = text;
      placed.add(p.index);
      continue;
    }
    if (content.contact === null && current === null && looksLikeContact(text)) {
      content.contact = text;
      placed.add(p.index);
      continue;
    }
    if (headingSize !== undefined && p.size === headingSize && !p.inTable && !p.listId) {
      current = { label: text, members: [] };
      groups.push(current);
      placed.add(p.index);
      continue;
    }
    if (current) {
      current.members.push(p);
      placed.add(p.index);
    }
  }

  const orphans: string[] = [];
  const structural: Para[] = [];
  content.sections = groups.map((g) => {
    const { section, unplaced, scaffolding } = toSection(g.label, g.members, entrySize);
    orphans.push(...unplaced);
    structural.push(...(scaffolding ?? []));
    return section;
  });

  // Paragraphs a section accepted but could not render count as dropped too.
  // Reporting them as placed would claim full coverage over text the output
  // does not contain, which is the one failure this whole design exists to
  // prevent.
  const dropped = [...withText.filter((p) => !placed.has(p.index)).map((p) => p.text.trim()), ...orphans];
  // Orphans were marked placed on the first pass, so discount them here — the
  // percentage and the dropped list have to describe the same document.
  const reallyPlaced = placed.size - orphans.length;

  // A markdown alignment row (`| :--- | :--- |`) is table scaffolding, not
  // content: it carries no words, and the output cannot contain it. Counting it
  // as placed would be the coverage report claiming text the document does not
  // have — the one thing this design exists to prevent. Counting it as dropped
  // would be just as wrong, and would put a false miss on every Jobright file
  // until the number stopped meaning anything. So it leaves both sides, exactly
  // as a blank paragraph already does.
  const total = withText.length - structural.length;
  const netPlaced = reallyPlaced - structural.length;
  return {
    content,
    coverage: {
      totalParagraphs: total,
      placed: netPlaced,
      dropped,
      percent: total === 0 ? 100 : Math.round((netPlaced / total) * 1000) / 10,
    },
  };
}

function toSection(
  label: string,
  members: Para[],
  entrySize: number | undefined
): { section: Section; unplaced: string[]; scaffolding?: Para[] } {
  if (/highlight/i.test(label)) {
    const { items, scaffolding } = toHighlights(members);
    return { section: { kind: "highlights", label, items }, unplaced: [], scaffolding };
  }

  const entryLines = members.filter((p) => !p.listId && (DATE_RANGE.test(p.text) || p.size === entrySize));
  if (entryLines.length > 0 && members.some((p) => p.listId)) {
    const { entries, unplaced } = toEntries(members, entrySize);
    return { section: { kind: "entries", label, entries }, unplaced };
  }

  if (members.length === 1 && !members[0].listId) {
    return { section: { kind: "prose", label, body: members[0].text.trim() }, unplaced: [] };
  }
  return { section: { kind: "bullets", label, items: members.map((p) => p.text.trim()) }, unplaced: [] };
}

/**
 * Highlights arrive in three shapes, all of them seen in real files:
 * "metric: description" in one paragraph, a metric paragraph followed by its
 * description, or a markdown table Jobright pastes in as plain text.
 *
 * Text is only ever sliced out of the source here, never composed — same as the
 * colon split has always done.
 */
function toHighlights(members: Para[]): { items: Highlight[]; scaffolding?: Para[] } {
  const asTable = fromMarkdownTable(members);
  if (asTable) return asTable;

  const out: Highlight[] = [];
  for (let i = 0; i < members.length; i += 1) {
    const text = members[i].text.trim();
    const colon = text.indexOf(":");
    if (colon > 0 && colon <= 24) {
      out.push({ metric: text.slice(0, colon).trim(), description: text.slice(colon + 1).trim() });
      continue;
    }
    const next = members[i + 1];
    if (next && text.length <= 24) {
      out.push({ metric: text, description: next.text.trim() });
      i += 1;
      continue;
    }
    out.push({ metric: "", description: text });
  }
  return { items: out };
}

const isPipeRow = (text: string) => /^\|.*\|$/.test(text.trim());
const splitCells = (text: string) =>
  text.trim().slice(1, -1).split("|").map((c) => c.trim());
/** `:---`, `---`, `:---:` — markdown's column alignment row. */
const isAlignmentRow = (text: string) => {
  const cells = splitCells(text);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
};

/**
 * Jobright renders Career Highlights as a markdown table and pastes the result
 * in as three ordinary paragraphs — a row of metrics, an alignment row, and a
 * row of descriptions. Left alone, the pipes and dashes render verbatim into the
 * output table.
 *
 * Only recognised when it is unambiguous and nothing is lost: one row of metrics
 * and one of descriptions, cell counts equal. Anything else falls through to the
 * paragraph rules and renders as written — ugly and visible beats parsed wrong
 * and silent, because whatever is dropped here is keyword coverage.
 */
function fromMarkdownTable(members: Para[]): { items: Highlight[]; scaffolding: Para[] } | null {
  const pipeRows = members.filter((p) => isPipeRow(p.text));
  if (pipeRows.length < 2 || pipeRows.length !== members.length) return null;

  const alignment = pipeRows.filter((p) => isAlignmentRow(p.text));
  const content = pipeRows.filter((p) => !isAlignmentRow(p.text));
  if (content.length !== 2) return null;

  const metrics = splitCells(content[0].text);
  const descriptions = splitCells(content[1].text);
  if (metrics.length === 0 || metrics.length !== descriptions.length) return null;

  return {
    items: metrics.map((metric, i) => ({ metric, description: descriptions[i] })),
    scaffolding: alignment,
  };
}

function toEntries(
  members: Para[],
  entrySize: number | undefined
): { entries: Entry[]; unplaced: string[] } {
  const entries: Entry[] = [];
  const unplaced: string[] = [];
  let current: Entry | null = null;

  for (const p of members) {
    const text = p.text.trim();
    if (p.listId) {
      // A bullet before any employer line has nothing to attach to. Report it
      // rather than swallowing it — the section's shape is wrong and you want
      // to see that before sending the document.
      if (current) current.bullets.push(text);
      else unplaced.push(text);
      continue;
    }

    const match = DATE_RANGE.exec(text);
    if (match) {
      // A date range marks a new role. Company and title are separated by a tab
      // or a run of spaces; Jobright fuses the date straight onto the title with
      // no separator, which peeling the match off has already handled.
      const head = text.slice(0, match.index).trim();
      const split = head.split(/\t|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      current = {
        company: split[0] ?? head,
        title: split.length > 1 ? split.slice(1).join(" ") : null,
        dates: match[0].trim(),
        bullets: [],
      };
      entries.push(current);
      continue;
    }

    // The line after an employer is its job title — same run size as the
    // employer line in a Jobright export, so size alone cannot tell them apart.
    if (current && current.title === null) {
      current.title = text;
      continue;
    }

    if (current === null) {
      current = { company: text, title: null, dates: null, bullets: [] };
      entries.push(current);
      continue;
    }

    // Anything else still belongs to the reader: render it rather than lose it.
    current.bullets.push(text);
  }
  return { entries, unplaced };
}
