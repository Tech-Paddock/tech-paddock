import { describe, expect, it } from "vitest";
import { verdictFor, type VerdictInput } from "@/lib/verdict";

const clean: VerdictInput = { coverage: { missing: [] }, findings: [], changeLog: [] };

describe("the reformat verdict", () => {
  it("passes a reformat that lost nothing and tripped nothing", () => {
    expect(verdictFor(clean)).toEqual({ pass: true, reasons: [], notes: [] });
  });

  it("fails when a line of the source reached the document nowhere", () => {
    const v = verdictFor({ ...clean, coverage: { missing: ["SQL, dbt, Looker"] } });
    expect(v.pass).toBe(false);
    expect(v.reasons[0]).toBe("1 line of the source reached no part of the document.");
  });

  it("counts lost lines rather than listing them — the list is Diagnostics' job", () => {
    const v = verdictFor({ ...clean, coverage: { missing: ["a", "b", "c"] } });
    expect(v.reasons[0]).toBe("3 lines of the source reached no part of the document.");
  });

  it("fails on a blocking finding, quoting it", () => {
    const v = verdictFor({
      ...clean,
      findings: [{ severity: "blocking", message: "The contact block is in a header." }],
    });
    expect(v.pass).toBe(false);
    expect(v.reasons).toContain("The contact block is in a header.");
  });

  /** The cry-wolf rule. A template finding is true of every render built on that
   *  template, so letting it vote would pin the verdict to FAIL until the
   *  template itself changed — and a verdict that never moves is not read. */
  it("does not fail on a warning, and carries it as a note instead", () => {
    const v = verdictFor({
      ...clean,
      findings: [{ severity: "warning", message: "A second table sits below Career Highlights." }],
    });
    expect(v.pass).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.notes).toEqual(["A second table sits below Career Highlights."]);
  });

  it("fails when the template had no room for some of the input", () => {
    const v = verdictFor({
      ...clean,
      changeLog: [
        { section: "Professional Experience", action: "trimmed-surplus" },
        { section: "Professional Experience", action: "trimmed-surplus" },
      ],
    });
    expect(v.pass).toBe(false);
    expect(v.reasons[0]).toBe(
      "2 entries had nowhere to go in the template and were dropped — Professional Experience."
    );
  });

  it("fails when a template section went unfilled, because it ships the template's own words", () => {
    const v = verdictFor({ ...clean, changeLog: [{ section: "Summary", action: "not-found-in-input" }] });
    expect(v.pass).toBe(false);
    expect(v.reasons[0]).toBe(
      "The source did not fill 1 section of the template, which keeps its own text — Summary."
    );
  });

  it("names each section once however many entries it has", () => {
    const v = verdictFor({
      ...clean,
      changeLog: [
        { section: "Summary", action: "not-found-in-input" },
        { section: "Summary", action: "not-found-in-input" },
        { section: "Hobbies", action: "not-found-in-input" },
      ],
    });
    expect(v.reasons[0]).toContain("Summary, Hobbies");
    expect(v.reasons[0]).not.toContain("Summary, Summary");
  });

  it("ignores the ordinary actions — a clone or a passthrough is not an irregularity", () => {
    const v = verdictFor({
      ...clean,
      changeLog: [
        { section: "Core Competencies", action: "cloned-overflow" },
        { section: "Education", action: "passthrough" },
        { section: "Summary", action: "replaced" },
        { section: "Career Highlights", action: "kept-unchanged" },
      ],
    });
    expect(v).toEqual({ pass: true, reasons: [], notes: [] });
  });

  it("gives every reason rather than stopping at the first", () => {
    const v = verdictFor({
      coverage: { missing: ["one line"] },
      findings: [
        { severity: "blocking", message: "Blocking thing." },
        { severity: "warning", message: "Warning thing." },
      ],
      changeLog: [
        { section: "Professional Experience", action: "trimmed-surplus" },
        { section: "Summary", action: "not-found-in-input" },
      ],
    });
    expect(v.pass).toBe(false);
    expect(v.reasons).toHaveLength(4);
    expect(v.notes).toEqual(["Warning thing."]);
  });
});
