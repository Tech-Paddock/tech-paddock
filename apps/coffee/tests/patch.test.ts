import { describe, expect, it } from "vitest";
import { changedFields, hasChanges } from "../lib/patch";

describe("changedFields", () => {
  // The bug this file was written for: the review screen sent an empty PATCH
  // whenever the purchase date was left alone, the route refused it, and the
  // page reported "Couldn't save that bag" about a bag already in the library.
  it("is empty when the form was not touched", () => {
    const saved: Record<string, string | null> = { purchased_date: "2026-09-01", roast_date: null, my_notes: "" };
    expect(changedFields(saved, { purchased_date: "2026-09-01", roast_date: "", my_notes: "" })).toEqual({});
    expect(hasChanges(changedFields(saved, { ...saved }))).toBe(false);
  });

  it("sends only the field that moved", () => {
    expect(
      changedFields(
        { purchased_date: "2026-09-01", roast_date: "2026-08-14", my_notes: "Jammy." },
        { purchased_date: "2026-09-01", roast_date: "2026-08-20", my_notes: "Jammy." }
      )
    ).toEqual({ roast_date: "2026-08-20" });
  });

  it("clears a field to null rather than to an empty string", () => {
    // A date column takes null or a date. "" is neither, and the error it
    // raises names a type rather than the field the person emptied.
    expect(changedFields({ roast_date: "2026-08-14" }, { roast_date: "" })).toEqual({ roast_date: null });
  });

  it("treats an absent value and a cleared one as the same emptiness", () => {
    expect(changedFields({ my_notes: null }, { my_notes: "" })).toEqual({});
    expect(changedFields({ my_notes: undefined }, { my_notes: "   " })).toEqual({});
  });

  it("ignores whitespace either side of a real change", () => {
    expect(changedFields({ my_notes: "Jammy." }, { my_notes: "  Jammy.  " })).toEqual({});
    expect(changedFields({ my_notes: "Jammy." }, { my_notes: " Bright. " })).toEqual({ my_notes: "Bright." });
  });

  // A form that posts every field it rendered will eventually post a blank
  // over something written elsewhere while it was open.
  it("never mentions a field the form did not carry", () => {
    expect(changedFields({ my_notes: "a", roast_date: "2026-08-14" } as Record<string, string>, { my_notes: "b" })).toEqual({
      my_notes: "b",
    });
  });
});
