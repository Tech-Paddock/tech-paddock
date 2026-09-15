import JSZip from "jszip";

/**
 * Build a .docx in memory from XML fragments.
 *
 * The checked-in fixtures are scrubbed copies of real exports, which is right
 * for "does this cope with a real file" but wrong for pinning one structural
 * trap. These documents are written here, in full, in the diff — so a fixture
 * cannot carry a name, an employer or a phone number that nobody noticed, in
 * `document.xml` or in any other part of the archive. That matters more in this
 * app than anywhere else in the repo.
 *
 * Deliberately minimal: enough parts for JSZip and the parsers to read, no more.
 */
export function makeDocx(parts: { body: string; header?: string; styles?: string; numbering?: string }): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  ${parts.header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${parts.header ? '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ""}
</Relationships>`
  );

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.body}
    <w:sectPr>
      ${parts.header ? '<w:headerReference w:type="first" r:id="rId7"/>' : ""}
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="900" w:right="1080" w:bottom="900" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  zip.file(
    "word/styles.xml",
    parts.styles ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`
  );

  if (parts.numbering) zip.file("word/numbering.xml", parts.numbering);

  if (parts.header) {
    zip.file(
      "word/header1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${parts.header}</w:hdr>`
    );
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

/** A paragraph whose single run carries an explicit size — the only structural
 *  signal a Jobright export offers, since it defines no named styles. */
export const para = (text: string, halfPoints?: number, opts: { list?: boolean } = {}) =>
  `<w:p>
    ${opts.list ? '<w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>' : ""}
    <w:r>${halfPoints === undefined ? "" : `<w:rPr><w:sz w:val="${halfPoints}"/></w:rPr>`}<w:t xml:space="preserve">${text}</w:t></w:r>
  </w:p>`;

/** One row of `n` cells, each holding the paragraphs given for it. */
export const table = (cellsPerRow: string[][]) =>
  `<w:tbl><w:tblPr/><w:tr>${cellsPerRow.map((ps) => `<w:tc>${ps.join("")}</w:tc>`).join("")}</w:tr></w:tbl>`;
