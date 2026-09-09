import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

type Template = {
  name: string;
  font: string | null;
  font_size: number | null;
  margins: { top?: number; bottom?: number; left?: number; right?: number } | null;
  section_order: string[] | null;
  spacing: { before?: number; after?: number; line?: number } | null;
  highlights_style: "table" | "list";
};

type Bullet = { content: string; display_order: number };

type Entry = {
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  bullets: Bullet[];
};

type Highlight = { content: string; display_order: number };

const DEFAULT_SECTION_ORDER = ["highlights", "experience"];
const INCHES_TO_TWIPS = 1440;

function formatDateRange(entry: Entry) {
  const start = entry.start_date ?? "";
  const end = entry.end_date ?? "Present";
  return [start, end].filter(Boolean).join(" – ");
}

function buildHighlightsList(highlights: Highlight[], fontSize: number | null) {
  return highlights.map(
    (h) =>
      new Paragraph({
        text: h.content,
        bullet: { level: 0 },
        run: fontSize ? { size: fontSize * 2 } : undefined,
      })
  );
}

// Flat rows/columns only, no merged cells, no nesting — per the ATS-safety
// exception for Career Highlights: a parser that loses this table loses
// nothing new, since the same content also appears in the body bullets.
function buildHighlightsTable(highlights: Highlight[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: highlights.map(
      (h) =>
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(h.content)],
            }),
          ],
        })
    ),
  });
}

function buildExperienceSection(entries: Entry[], fontSize: number | null) {
  const sorted = [...entries].sort((a, b) => a.display_order - b.display_order);
  const paragraphs: Paragraph[] = [];

  for (const entry of sorted) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${entry.title}, ${entry.company}`, bold: true }),
          new TextRun({ text: `    ${formatDateRange(entry)}`, italics: true }),
        ],
      })
    );

    const bullets = [...entry.bullets].sort((a, b) => a.display_order - b.display_order);
    for (const bullet of bullets) {
      paragraphs.push(
        new Paragraph({
          text: bullet.content,
          bullet: { level: 0 },
          run: fontSize ? { size: fontSize * 2 } : undefined,
        })
      );
    }
  }

  return paragraphs;
}

export async function buildResumeDocx({
  template,
  entries,
  highlights,
}: {
  template: Template;
  entries: Entry[];
  highlights: Highlight[];
}): Promise<Buffer> {
  const fontSize = template.font_size ?? null;
  const order = template.section_order?.length ? template.section_order : DEFAULT_SECTION_ORDER;

  const children: (Paragraph | Table)[] = [];

  for (const section of order) {
    if (section === "highlights" && highlights.length > 0) {
      children.push(new Paragraph({ text: "Career Highlights", heading: HeadingLevel.HEADING_1 }));
      if (template.highlights_style === "table") {
        children.push(buildHighlightsTable(highlights));
      } else {
        children.push(...buildHighlightsList(highlights, fontSize));
      }
    }

    if (section === "experience" && entries.length > 0) {
      children.push(new Paragraph({ text: "Experience", heading: HeadingLevel.HEADING_1 }));
      children.push(...buildExperienceSection(entries, fontSize));
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: template.font ?? "Calibri",
            size: fontSize ? fontSize * 2 : 22,
          },
          paragraph: {
            spacing: {
              before: template.spacing?.before,
              after: template.spacing?.after,
              line: template.spacing?.line,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (template.margins?.top ?? 1) * INCHES_TO_TWIPS,
              bottom: (template.margins?.bottom ?? 1) * INCHES_TO_TWIPS,
              left: (template.margins?.left ?? 1) * INCHES_TO_TWIPS,
              right: (template.margins?.right ?? 1) * INCHES_TO_TWIPS,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
