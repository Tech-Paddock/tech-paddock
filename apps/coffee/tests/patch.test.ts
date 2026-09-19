import { describe, expect, it } from "vitest";
import { changedFields, hasChanges, missingRequired, REQUIRED } from "../lib/patch";

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

describe("missingRequired", () => {
  // Joel's call on 2026-09-19, after seeing the first fix close the panel
  // quietly: the error should name the field. "Couldn't save that bag" said
  // what failed; this says what to do about it.
  it("names the field rather than the failure", () => {
    expect(missingRequired({ purchased_date: "" })).toBe("Purchase date required.");
    expect(missingRequired({ purchased_date: "   " })).toBe("Purchase date required.");
    expect(missingRequired({ purchased_date: null })).toBe("Purchase date required.");
  });

  it("says nothing once the field is there", () => {
    expect(missingRequired({ purchased_date: "2026-09-01", roast_date: "" })).toBeNull();
  });

  // A screen that never showed the field is not failing to fill it in, and an
  // error about a control that is not on the page cannot be acted on.
  it("does not demand a field the form never carried", () => {
    expect(missingRequired({ my_notes: "" })).toBeNull();
    expect(missingRequired({})).toBeNull();
  });

  it("holds the same rule on every screen that edits a bag", () => {
    // Both save paths read this table. A requirement that applied on one
    // screen and not the other is one you find out about by accident.
    expect(Object.keys(REQUIRED)).toEqual(["purchased_date"]);
  });
});
