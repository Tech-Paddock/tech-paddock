import { describe, expect, it } from "vitest";
import { isIsoDate, parseLabelDate, roastDateFromLabel } from "../lib/dates";

describe("roastDateFromLabel", () => {
  it("puts a date the label printed another way into the form as YYYY-MM-DD", () => {
    // The bag that failed to save: the label said 08.14.26.
    expect(roastDateFromLabel("08.14.26")).toEqual({ value: "2026-08-14", unread: null });
    expect(roastDateFromLabel("Roasted 14 Aug 2026")).toEqual({ value: "2026-08-14", unread: null });
  });

  it("leaves an ambiguous date out of the form and says what the label said", () => {
    expect(roastDateFromLabel("05/06/26")).toEqual({ value: "", unread: "05/06/26" });
  });

  it("is an empty field and no hint when the label printed no date", () => {
    expect(roastDateFromLabel(null)).toEqual({ value: "", unread: null });
    expect(roastDateFromLabel("")).toEqual({ value: "", unread: null });
  });
});

describe("parseLabelDate", () => {
  it("takes an ISO date as it stands", () => {
    expect(parseLabelDate("2026-08-14")).toEqual({ iso: "2026-08-14", text: null });
  });

  it("reads the wording roasters actually print", () => {
    for (const printed of [
      "Roasted 2026/8/14",
      "ROAST DATE: 2026.08.14",
      "14 Aug 2026",
      "14th August, 2026",
      "Aug 14, 2026",
      "Roasted on August 14 26",
      "14-AUG-26",
    ]) {
      expect(parseLabelDate(printed), printed).toEqual({ iso: "2026-08-14", text: null });
    }
  });

  it("reads an all-numeric date only when one number cannot be a month", () => {
    expect(parseLabelDate("14/08/2026").iso).toBe("2026-08-14");
    expect(parseLabelDate("08/14/2026").iso).toBe("2026-08-14");
  });

  // The whole reason this file exists rather than a call to Date().
  it("refuses a numeric date that is genuinely two dates", () => {
    expect(parseLabelDate("05/06/2026")).toEqual({ iso: null, text: "05/06/2026" });
  });

  it("keeps what the label said when it cannot be read", () => {
    expect(parseLabelDate("Roasted fresh weekly")).toEqual({ iso: null, text: "Roasted fresh weekly" });
  });

  // An unprinted date and an unreadable one are both an empty field on screen,
  // and only one of them is an answer. This is the distinction that carries it.
  it("tells nothing printed apart from nothing readable", () => {
    expect(parseLabelDate(null)).toEqual({ iso: null, text: null });
    expect(parseLabelDate("  ")).toEqual({ iso: null, text: null });
    expect(parseLabelDate("週間焙煎").text).toBe("週間焙煎");
  });

  it("refuses a date the calendar does not have", () => {
    expect(parseLabelDate("2026-02-30").iso).toBeNull();
    expect(parseLabelDate("2026-13-01").iso).toBeNull();
    expect(parseLabelDate("31 Feb 2026").iso).toBeNull();
  });

  it("keeps a leap day that exists and refuses one that does not", () => {
    expect(parseLabelDate("2024-02-29").iso).toBe("2024-02-29");
    expect(parseLabelDate("2026-02-29").iso).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("accepts only a real date in the one shape a date column takes", () => {
    expect(isIsoDate("2026-08-14")).toBe(true);
    expect(isIsoDate("2026-8-14")).toBe(false);
    expect(isIsoDate("14/08/2026")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate(20260814)).toBe(false);
  });
});
