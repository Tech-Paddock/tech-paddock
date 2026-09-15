import { XMLParser } from "fast-xml-parser";

/**
 * One run of a paragraph — a stretch of text sharing one set of properties.
 *
 * Word splits a line into runs wherever the formatting changes, which is the
 * only place the employer/title/dates trio can be read from: all three live in a
 * single paragraph, distinguished by nothing but their runs. Null means the run
 * carries no explicit value and inherits the document default.
 */
export type Run = {
  text: string;
  /** Half-points, as w:sz stores it. */
  size: number | null;
  /** Six hex digits, upper case. `w:val="auto"` reads as null — it means "let
   *  Word pick", not "black". */
  color: string | null;
  bold: boolean;
  italic: boolean;
  /** Inside a `<w:hyperlink>`. A link is coloured and underlined because it is a
   *  link, so its colour describes the link rather than the line it sits in. */
  inHyperlink: boolean;
};

/** One paragraph of a Word document, plus every structural signal the labeller needs. */
export type Para = {
  index: number;
  text: string;
  /** w:sz is half-points: 22 means 11pt. Null when the run carries no explicit size. */
  size: number | null;
  bold: boolean;
  italic: boolean;
  /** w:numId — paragraphs sharing one are a single list. */
  listId: string | null;
  styleId: string | null;
  hasImage: boolean;
  inTable: boolean;
  /** Inside a <w:sdt> content control. Google Docs exports leave these behind. */
  inContentControl: boolean;
  /** Which table cell this paragraph sits in, counting tables and their rows and
   *  cells in document order. Null outside a table. Career Highlights is the one
   *  table the output reproduces, so its cells are where the metric and
   *  description formatting has to be read from. */
  cell: { table: number; row: number; cell: number } | null;
  /** Every run, in order. `size`, `bold` and `italic` above are the first run's,
   *  which stands in for the paragraph's look. */
  runs: Run[];
};

type Node = Record<string, unknown>;

// preserveOrder already groups attributes under ":@" — naming it explicitly
// makes fast-xml-parser nest the group inside itself.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
});

function tagOf(node: Node): string | null {
  for (const key of Object.keys(node)) if (key !== ":@" && key !== "#text") return key;
  return null;
}
const kidsOf = (node: Node, tag: string): Node[] => (node[tag] as Node[] | undefined) ?? [];
const attrsOf = (node: Node): Record<string, string> => (node[":@"] as Record<string, string>) ?? {};

function findFirst(nodes: Node[], tag: string): Node | null {
  for (const node of nodes) {
    const t = tagOf(node);
    if (t === tag) return node;
    if (t) {
      const hit = findFirst(kidsOf(node, t), tag);
      if (hit) return hit;
    }
  }
  return null;
}

function hasTag(nodes: Node[], tag: string): boolean {
  return findFirst(nodes, tag) !== null;
}

/** Concatenate every <w:t> in document order. Text always comes from here — the
 *  model only ever labels these paragraphs, it never reproduces their text. */
function textOf(nodes: Node[]): string {
  let out = "";
  for (const node of nodes) {
    const t = tagOf(node);
    if (!t) continue;
    if (t === "w:t") {
      for (const child of kidsOf(node, "w:t")) {
        if (typeof child["#text"] === "string") out += child["#text"];
        else if (typeof child["#text"] === "number") out += String(child["#text"]);
      }
    } else if (t === "w:tab") {
      out += "\t";
    } else {
      out += textOf(kidsOf(node, t));
    }
  }
  return out;
}

/** `<w:b/>` means on, but `<w:b w:val="0"/>` means explicitly off — a template
 *  that un-bolds a heading would otherwise read as bold. */
function toggleOn(kids: Node[], tag: string): boolean {
  const node = kids.find((n) => tagOf(n) === tag);
  if (!node) return false;
  const val = attrsOf(node)["w:val"];
  return val === undefined || !["0", "false", "off"].includes(val);
}

function describeRun(run: Node, inHyperlink: boolean): Run {
  const kids = kidsOf(run, "w:r");
  const rPr = kids.find((n) => tagOf(n) === "w:rPr");
  const rPrKids = rPr ? kidsOf(rPr, "w:rPr") : [];

  const sz = rPrKids.find((n) => tagOf(n) === "w:sz");
  const rawSize = sz ? Number(attrsOf(sz)["w:val"]) : NaN;

  // "auto" is Word deciding for itself, which is not a colour and must not be
  // copied into the output as one.
  const color = rPrKids.find((n) => tagOf(n) === "w:color");
  const rawColor = color ? attrsOf(color)["w:val"] : undefined;

  return {
    text: textOf(kids),
    size: Number.isFinite(rawSize) ? rawSize : null,
    color: rawColor && /^[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor.toUpperCase() : null,
    bold: toggleOn(rPrKids, "w:b"),
    italic: toggleOn(rPrKids, "w:i"),
    inHyperlink,
  };
}

/** Every run in the paragraph, in order, including the ones Word wraps in a
 *  hyperlink or a content control. A nested `<w:p>` is somebody else's
 *  paragraph, so its runs are not collected here. */
function runsOf(nodes: Node[], inHyperlink = false): { node: Node; inHyperlink: boolean }[] {
  const out: { node: Node; inHyperlink: boolean }[] = [];
  for (const node of nodes) {
    const t = tagOf(node);
    if (!t || t === "w:p") continue;
    if (t === "w:r") out.push({ node, inHyperlink });
    else out.push(...runsOf(kidsOf(node, t), inHyperlink || t === "w:hyperlink"));
  }
  return out;
}

function describe(
  paragraph: Node,
  index: number,
  inTable: boolean,
  inContentControl: boolean,
  cell: Para["cell"]
): Para {
  const body = kidsOf(paragraph, "w:p");
  const pPr = body.find((n) => tagOf(n) === "w:pPr");
  const pPrKids = pPr ? kidsOf(pPr, "w:pPr") : [];

  const numPr = pPrKids.find((n) => tagOf(n) === "w:numPr");
  const numId = numPr ? findFirst(kidsOf(numPr, "w:numPr"), "w:numId") : null;
  const pStyle = pPrKids.find((n) => tagOf(n) === "w:pStyle");

  // First run's properties stand in for the paragraph's look. Jobright applies
  // every attribute directly to each run and defines no named styles at all, so
  // run size is the only structural signal its documents carry.
  const runs = runsOf(body).map((r) => describeRun(r.node, r.inHyperlink));
  const first = runs[0];

  return {
    index,
    text: textOf(body),
    size: first?.size ?? null,
    bold: first?.bold ?? false,
    italic: first?.italic ?? false,
    listId: numId ? attrsOf(numId)["w:val"] ?? null : null,
    styleId: pStyle ? attrsOf(pStyle)["w:val"] ?? null : null,
    hasImage: hasTag(body, "w:drawing") || hasTag(body, "w:pict"),
    inTable,
    inContentControl,
    cell,
    runs,
  };
}

/**
 * Every paragraph in the document, in document order.
 *
 * Walks the whole tree rather than the body's direct children: content can be
 * nested inside <w:sdt> content controls and table cells, and reading only the
 * top level makes entire sections look empty.
 */
export function extractParagraphs(documentXml: string): Para[] {
  const tree = parser.parse(documentXml) as Node[];
  const out: Para[] = [];
  // Tables are counted across the whole document rather than per nesting level,
  // so "the first table" means the first one a reader meets. A nested table would
  // therefore take a number of its own, which is fine: the output is never
  // allowed to nest one anyway.
  let tables = 0;

  // Mutated in place as rows and cells are entered, and snapshotted onto each
  // paragraph. Rows are visited in order, so a counter is the only way to number
  // them — every sibling row would otherwise read as the same one. A nested table
  // gets its own object, leaving the enclosing cell's position intact for the
  // paragraphs that follow it.
  const walk = (nodes: Node[], inTable: boolean, inControl: boolean, pos: { table: number; row: number; cell: number } | null) => {
    for (const node of nodes) {
      const t = tagOf(node);
      if (!t) continue;
      if (t === "w:p") {
        const cell = pos && pos.row >= 0 && pos.cell >= 0 ? { ...pos } : null;
        out.push(describe(node, out.length, inTable, inControl, cell));
        continue; // a nested w:p inside a run is not a real paragraph
      }
      if (t === "w:tbl") {
        walk(kidsOf(node, t), true, inControl, { table: tables++, row: -1, cell: -1 });
        continue;
      }
      if (t === "w:tr" && pos) {
        pos.row += 1;
        pos.cell = -1;
        walk(kidsOf(node, t), inTable, inControl, pos);
        continue;
      }
      if (t === "w:tc" && pos) {
        pos.cell += 1;
        walk(kidsOf(node, t), inTable, inControl, pos);
        continue;
      }
      walk(kidsOf(node, t), inTable, inControl || t === "w:sdt", pos);
    }
  };

  walk(tree, false, false, null);
  return out;
}
