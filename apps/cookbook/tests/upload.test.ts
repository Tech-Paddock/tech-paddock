import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, base64Bytes, validateRecipeFile } from "@/lib/upload";

/**
 * The server's gate on a recipe file. Mostly what it refuses, because the
 * browser already sends the right thing and this exists for when it does not.
 */

const tiny = Buffer.from("not really a jpeg").toString("base64");

describe("validateRecipeFile", () => {
  it("accepts a photo and a PDF", () => {
    expect(validateRecipeFile({ mediaType: "image/jpeg", data: tiny })).toEqual({
      file: { mediaType: "image/jpeg", data: tiny },
    });
    expect("file" in validateRecipeFile({ mediaType: "application/pdf", data: tiny })).toBe(true);
  });

  it("refuses a type the model cannot read", () => {
    for (const mediaType of ["image/heic", "text/html", "application/zip", "", undefined]) {
      expect("error" in validateRecipeFile({ mediaType, data: tiny })).toBe(true);
    }
  });

  it("refuses nothing at all", () => {
    expect("error" in validateRecipeFile(undefined)).toBe(true);
    expect("error" in validateRecipeFile({ mediaType: "image/png", data: "" })).toBe(true);
  });

  it("refuses a data: URL rather than stripping it", () => {
    const r = validateRecipeFile({ mediaType: "image/png", data: `data:image/png;base64,${tiny}` });
    expect("error" in r).toBe(true);
  });

  it("refuses a file over the cap, and allows one exactly at it", () => {
    const at = Buffer.alloc(MAX_FILE_BYTES).toString("base64");
    const over = Buffer.alloc(MAX_FILE_BYTES + 1).toString("base64");
    expect("file" in validateRecipeFile({ mediaType: "application/pdf", data: at })).toBe(true);
    expect("error" in validateRecipeFile({ mediaType: "application/pdf", data: over })).toBe(true);
  });
});

describe("base64Bytes", () => {
  it("matches the decoded length, padding included", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 1000]) {
      const b64 = Buffer.alloc(n).toString("base64");
      expect(base64Bytes(b64)).toBe(n);
    }
  });
});
