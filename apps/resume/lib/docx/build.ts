import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";
import type { TemplateSpec } from "./spec";
import type { Entry, Highlight, ResumeContent, Section } from "./label";

const BULLET_REF = "resume-bullets";
const CONTENT_WIDTH_TWIPS = 9360;

/**
 * Build the .docx. Deterministic by construction: the same content and spec
 * produce the same document every time, which is what makes a saved render
 * trustworthy as a record of what was actually sent.
 *
 * Contact details go in the body and never in a page header — that is the single
 * most common way a resume loses its phone number in parsing. The only table is
 * Career Highlights, whose content is repeated in the body bullets.
 */
export async function buildResumeDocx(content: ResumeContent, spec: TemplateSpec): Promise<Buffer> {
  const half = (pt: number) => Math.round(pt * 2);
  const children: (Paragraph | Table)[] = [];

  if (content.name) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: content.name,
            bold: true,
            size: half(spec.nameSize),
            color: spec.nameColor ?? undefined,
          }),
        ],
      })
    );
  }

  if (content.contact) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: content.contact, size: half(spec.contactSize) })],
      })
    );
  }

  for (const section of content.sections) {
    children.push(heading(section.label, spec));
    children.push(...renderSection(section, spec));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: spec.font, size: half(spec.bodySize) } },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: spec.bulletGlyph,
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 260, hanging: 200 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(spec.margins.top),
              right: convertInchesToTwip(spec.margins.right),
              bottom: convertInchesToTwip(spec.margins.bottom),
              left: convertInchesToTwip(spec.margins.left),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function heading(label: string, spec: TemplateSpec) {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    // A real paragraph border, not an image. Jobright draws its section rules as
    // PNGs, which a parser sees as images rather than as structure.
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 1, color: "CCCCCC" } },
    children: [
      new TextRun({
        text: label,
        bold: spec.headingBold,
        size: Math.round(spec.headingSize * 2),
        color: spec.headingColor ?? undefined,
      }),
    ],
  });
}

function renderSection(section: Section, spec: TemplateSpec): (Paragraph | Table)[] {
  switch (section.kind) {
    case "prose":
      return [new Paragraph({ spacing: { after: spec.spacing.after }, children: [new TextRun(section.body)] })];
    case "bullets":
      return section.items.map(bullet);
    case "entries":
      return section.entries.flatMap((e) => renderEntry(e, spec));
    case "highlights":
      return spec.highlightsStyle === "table"
        ? [highlightsTable(section.items)]
        : section.items.map((h) => bullet(h.metric ? `${h.metric}: ${h.description}` : h.description));
  }
}

const bullet = (text: string) =>
  new Paragraph({ numbering: { reference: BULLET_REF, level: 0 }, spacing: { after: 20 }, children: [new TextRun(text)] });

function renderEntry(entry: Entry, spec: TemplateSpec): Paragraph[] {
  const runs: TextRun[] = [new TextRun({ text: entry.company, bold: true, size: Math.round(spec.entrySize * 2) })];
  if (entry.title) runs.push(new TextRun({ text: `   ${entry.title}`, italics: true }));
  if (entry.dates) runs.push(new TextRun({ text: `\t${entry.dates}` }));

  return [
    new Paragraph({
      spacing: { before: 120, after: 20 },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIPS }],
      children: runs,
    }),
    ...entry.bullets.map(bullet),
  ];
}

/** Flat rows, two columns, no merged cells, no nesting — the one permitted table. */
function highlightsTable(items: Highlight[]): Table {
  const metricWidth = 2200;
  return new Table({
    columnWidths: [metricWidth, CONTENT_WIDTH_TWIPS - metricWidth],
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: items.map(
      (h) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: metricWidth, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: h.metric, bold: true })] })],
            }),
            new TableCell({
              width: { size: CONTENT_WIDTH_TWIPS - metricWidth, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun(h.description)] })],
            }),
          ],
        })
    ),
  });
}
