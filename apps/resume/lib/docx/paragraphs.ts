import { XMLParser } from "fast-xml-parser";

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

function describe(paragraph: Node, index: number, inTable: boolean, inContentControl: boolean): Para {
  const body = kidsOf(paragraph, "w:p");
  const pPr = body.find((n) => tagOf(n) === "w:pPr");
  const pPrKids = pPr ? kidsOf(pPr, "w:pPr") : [];

  const numPr = pPrKids.find((n) => tagOf(n) === "w:numPr");
  const numId = numPr ? findFirst(kidsOf(numPr, "w:numPr"), "w:numId") : null;
  const pStyle = pPrKids.find((n) => tagOf(n) === "w:pStyle");

  // First run's properties stand in for the paragraph's look. Jobright applies
  // every attribute directly to each run and defines no named styles at all, so
  // run size is the only structural signal its documents carry.
  const firstRun = body.find((n) => tagOf(n) === "w:r");
  const rPr = firstRun ? kidsOf(firstRun, "w:r").find((n) => tagOf(n) === "w:rPr") : undefined;
  const rPrKids = rPr ? kidsOf(rPr, "w:rPr") : [];
  const sz = rPrKids.find((n) => tagOf(n) === "w:sz");
  const rawSize = sz ? Number(attrsOf(sz)["w:val"]) : NaN;

  return {
    index,
    text: textOf(body),
    size: Number.isFinite(rawSize) ? rawSize : null,
    bold: rPrKids.some((n) => tagOf(n) === "w:b"),
    italic: rPrKids.some((n) => tagOf(n) === "w:i"),
    listId: numId ? attrsOf(numId)["w:val"] ?? null : null,
    styleId: pStyle ? attrsOf(pStyle)["w:val"] ?? null : null,
    hasImage: hasTag(body, "w:drawing") || hasTag(body, "w:pict"),
    inTable,
    inContentControl,
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

  const walk = (nodes: Node[], inTable: boolean, inControl: boolean) => {
    for (const node of nodes) {
      const t = tagOf(node);
      if (!t) continue;
      if (t === "w:p") {
        out.push(describe(node, out.length, inTable, inControl));
        continue; // a nested w:p inside a run is not a real paragraph
      }
      walk(kidsOf(node, t), inTable || t === "w:tbl", inControl || t === "w:sdt");
    }
  };

  walk(tree, false, false);
  return out;
}
