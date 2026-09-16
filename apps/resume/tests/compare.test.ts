import { describe, expect, it } from "vitest";
import { compareContent } from "../lib/docx/compare";
import type { Para } from "../lib/docx/paragraphs";

const para = (text: string, index: number): Para => ({
  index,
  text,
  size: null,
  bold: false,
  italic: false,
  listId: null,
  styleId: null,
  hasImage: false,
  inTable: false,
  inContentControl: false,
  cell: null,
  runs: [],
});

const doc = (...lines: string[]) => lines.map(para);

describe("comparing a finished resume against the document its text came from", () => {
  it("reports full coverage when every line arrived", () => {
    const result = compareContent(doc("Led the migration", "Cut costs 30%"), doc("Led the migration", "Cut costs 30%"));
    expect(result).toEqual({ totalLines: 2, present: 2, missing: [], percent: 100 });
  });

  it("names the line that reached the document nowhere, verbatim", () => {
    const result = compareContent(doc("Led the migration", "Cut costs 30%"), doc("Led the migration"));
    expect(result.missing).toEqual(["Cut costs 30%"]);
    expect(result.present).toBe(1);
    expect(result.percent).toBe(50);
  });

  // The whole design rests on this: a report that overstates what the document
  // contains is worse than no report, because it reads as verified.
  it("does not count a short line as present because it sits inside a longer number", () => {
    const result = compareContent(doc("230"), doc("Managed a portfolio of 1230 accounts"));
    expect(result.missing).toEqual(["230"]);
    expect(result.percent).toBe(0);
  });

  it("counts a short line that stands on its own word boundary", () => {
    const result = compareContent(doc("230"), doc("Onboarded 230 accounts"));
    expect(result.missing).toEqual([]);
    expect(result.percent).toBe(100);
  });

  it("treats Word's curly quotes and en dashes as the characters they replaced", () => {
    const result = compareContent(
      doc(`Owner's report -- quarterly`),
      doc(`Owner’s report – quarterly`)
    );
    expect(result.missing).toEqual([]);
  });

  it("ignores a difference that is only whitespace, including a non-breaking space", () => {
    const result = compareContent(doc("Cut   costs  30%"), doc("Cut costs 30%"));
    expect(result.missing).toEqual([]);
  });

  // Editing in Word legitimately merges and splits paragraphs. That is not a
  // dropped word, so it must not read as one.
  it("finds a source line that was merged into a longer paragraph", () => {
    const result = compareContent(doc("Cut costs 30%"), doc("Cut costs 30% across three regions"));
    expect(result.missing).toEqual([]);
  });

  it("excludes blank paragraphs and markdown alignment rows from both sides", () => {
    const result = compareContent(doc("| $250,000 | 30% |", "| :--- | :--- |", "   ", "Real line"), doc("Real line"));
    expect(result.totalLines).toBe(2);
    expect(result.missing).toEqual(["| $250,000 | 30% |"]);
  });

  // A duplicate must not let one genuine miss hide behind a line that landed.
  it("counts a repeated source line once", () => {
    const result = compareContent(doc("Led the migration", "Led the migration"), doc("Led the migration"));
    expect(result.totalLines).toBe(1);
    expect(result.present).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it("does not treat regex metacharacters in the source as a pattern", () => {
    const result = compareContent(doc("Raised margin (net) by 12%"), doc("Raised margin (net) by 12%"));
    expect(result.missing).toEqual([]);
    const absent = compareContent(doc("C++ (advanced)"), doc("Wrote C# and Java"));
    expect(absent.missing).toEqual(["C++ (advanced)"]);
  });

  it("reports 100% for an empty source rather than dividing by zero", () => {
    expect(compareContent(doc("  ", ""), doc("Anything")).percent).toBe(100);
  });

  // Moving text between two documents legitimately breaks a line apart. Calling
  // that "missing" produced nine false alarms in forty-two lines on the real
  // fixtures, and a report that cries wolf that often is one you stop reading.
  describe("text that moved rather than went missing", () => {
    it("accepts an employer line that had a job title inserted into it", () => {
      const result = compareContent(
        doc("Northwind Athletics Jan 2026 - Present"),
        doc("Northwind Athletics", "   Sr. Platform Administrator", "\tJan 2026 - Present")
      );
      expect(result.missing).toEqual([]);
    });

    it("accepts a metric:description pair split into two table cells", () => {
      const result = compareContent(
        doc("$250,000:Recovered in disputed vendor billing"),
        doc("$250,000", "Recovered in disputed vendor billing")
      );
      expect(result.missing).toEqual([]);
    });
  });

  // The counterweight to the above: matching loose words instead of consecutive
  // runs would report a deleted bullet as present, because every word in it
  // occurs somewhere else in a resume full of similar bullets.
  it("still catches a deleted line whose every word appears in its siblings", () => {
    const siblings = [
      "Delivered a representative accomplishment for region 16",
      "Delivered a representative accomplishment for region 17",
      "Delivered a representative accomplishment for region 18",
    ];
    const result = compareContent(doc(...siblings), doc(siblings[0], siblings[2]));
    expect(result.missing).toEqual(["Delivered a representative accomplishment for region 17"]);
    expect(result.present).toBe(2);
  });
});
