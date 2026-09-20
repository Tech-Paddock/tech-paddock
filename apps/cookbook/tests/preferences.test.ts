import { describe, expect, it } from "vitest";
import {
  matchPreference,
  normalizePhrase,
  readDraft,
  resolveLink,
  searchFor,
  type Preference,
} from "../lib/preferences";

function pref(phrase: string, over: Partial<Preference> = {}): Preference {
  return {
    id: phrase,
    phrase,
    kind: "terms",
    url: null,
    terms: `${phrase} the good one`,
    brand: null,
    note: null,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...over,
  };
}

describe("normalizePhrase", () => {
  // The database refuses a duplicate phrase using exactly this expression. If
  // these two drift, a collision happens that the app cannot explain.
  it("matches the index expression: trim, collapse, lowercase", () => {
    expect(normalizePhrase("  Whole   MILK ")).toBe("whole milk");
  });
});

describe("matchPreference", () => {
  const prefs = [pref("milk"), pref("whole milk", { kind: "plain", terms: null })];

  it("the longest phrase decides", () => {
    // Joel's own case, and the reason the table is the size of his decisions
    // rather than the size of his vocabulary.
    expect(matchPreference("2 cups whole milk", prefs)?.phrase).toBe("whole milk");
    expect(matchPreference("1 cup milk", prefs)?.phrase).toBe("milk");
  });

  it("matches whole words, so milk is not buttermilk", () => {
    expect(matchPreference("buttermilk", prefs)).toBeNull();
    expect(matchPreference("skimmed milk powder", prefs)?.phrase).toBe("milk");
  });

  it("matches a multi-word phrase only when the words are adjacent and in order", () => {
    expect(matchPreference("milk, whole", prefs)?.phrase).toBe("milk");
  });

  it("the most recently updated row breaks a tie between equal-length phrases", () => {
    const older = pref("eggs", { id: "older", updated_at: "2026-09-01T00:00:00Z" });
    const newer = pref("eggs", { id: "newer", updated_at: "2026-09-19T00:00:00Z" });
    expect(matchPreference("a dozen eggs", [older, newer])?.id).toBe("newer");
  });

  it("no opinion is null, not a guess", () => {
    expect(matchPreference("saffron", prefs)).toBeNull();
  });
});

describe("resolveLink", () => {
  it("a product preference wins outright", () => {
    const p = pref("milk", { kind: "product", url: "https://www.kingsoopers.com/p/fairlife", terms: null });
    expect(resolveLink({ name: "milk" }, [p]).href).toBe("https://www.kingsoopers.com/p/fairlife");
  });

  it("a terms preference searches the words, not the line", () => {
    const p = pref("milk", { terms: "fairlife 2%" });
    expect(resolveLink({ name: "1 cup milk" }, [p]).href).toBe(searchFor("fairlife 2%"));
  });

  it("a plain preference resolves like no preference — but says it decided", () => {
    const p = pref("whole milk", { kind: "plain", terms: null });
    const resolved = resolveLink({ name: "whole milk" }, [p]);
    // The URL is identical to the unmatched case. The difference is `via`, and it
    // matters: "you asked for the ordinary one" and "nothing matched" are
    // different facts about the same link.
    expect(resolved.href).toBe(searchFor("whole milk"));
    expect(resolved.via?.kind).toBe("plain");
  });

  it("falls back to the line's own name when nothing matches", () => {
    const resolved = resolveLink({ name: "saffron" }, [pref("milk")]);
    expect(resolved.href).toBe(searchFor("saffron"));
    expect(resolved.via).toBeNull();
  });
});

describe("readDraft", () => {
  it("refuses a product preference with no link", () => {
    const read = readDraft({ phrase: "milk", kind: "product" });
    expect("error" in read && read.error).toContain("needs a url");
  });

  it("refuses a pasted product name in the url column", () => {
    // A dead tap on a phone in a shop is the failure this catches. Whether the
    // page exists cannot be checked from anywhere in this repo.
    const read = readDraft({ phrase: "milk", kind: "product", url: "fairlife 2%" });
    expect("error" in read && read.error).toContain("https://");
  });

  it("refuses an unknown kind, naming the phrase so a batch says which row", () => {
    const read = readDraft({ phrase: "milk", kind: "favourite" });
    expect("error" in read && read.error).toContain("milk");
  });

  it("drops the payload that does not belong to the kind", () => {
    const read = readDraft({ phrase: "whole milk", kind: "plain", url: "https://example.com", terms: "x" });
    expect("row" in read && read.row.url).toBeNull();
    expect("row" in read && read.row.terms).toBeNull();
  });

  it("keeps the brand, because a line that cannot say what it picked is not legible", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%", brand: "Fairlife" });
    expect("row" in read && read.row.brand).toBe("Fairlife");
  });
});
