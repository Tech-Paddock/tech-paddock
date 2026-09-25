import { describe, expect, it } from "vitest";
import { searchFor, searchUrl } from "../lib/grocery";
import { isKingSoopersProduct } from "../lib/kingsoopers";
import {
  matchPreference,
  normalizePhrase,
  readDraft,
  resolveLink,
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

  it("hands back the matched row itself, so the editor opens the rule that is deciding", () => {
    // Regression: `via` used to be a summary, so *remember* on this line
    // prefilled "2 cups whole milk" and saving wrote a second, narrower row
    // that shadowed the rule it was meant to edit.
    const p = pref("whole milk", { id: "the-rule", terms: "whole milk" });
    expect(resolveLink({ name: "2 cups whole milk" }, [p]).via?.id).toBe("the-rule");
  });

  it("the fallback is the same builder the plain list link uses", () => {
    // One URL shape, in one place. Two builders is how the /q/ path gets fixed
    // in one of them.
    expect(resolveLink({ name: "saffron" }, []).href).toBe(searchUrl({ name: "saffron" }));
  });

  it("falls back to the line's own name when nothing matches", () => {
    const resolved = resolveLink({ name: "saffron" }, [pref("milk")]);
    expect(resolved.href).toBe(searchFor("saffron"));
    expect(resolved.via).toBeNull();
  });
});

describe("isKingSoopersProduct — what Paste accepts", () => {
  it("accepts a product page", () => {
    expect(isKingSoopersProduct("https://www.kingsoopers.com/p/fairlife-2-milk/0020262400000")).toBe(true);
    expect(isKingSoopersProduct("  https://kingsoopers.com/p/eggs/0001111060903  ")).toBe(true);
  });

  it("refuses a search, another shop, plain http and plain words", () => {
    expect(isKingSoopersProduct("https://www.kingsoopers.com/q/milk")).toBe(false);
    expect(isKingSoopersProduct("https://www.kroger.com/p/fairlife/0020262400000")).toBe(false);
    expect(isKingSoopersProduct("http://www.kingsoopers.com/p/fairlife/0020262400000")).toBe(false);
    expect(isKingSoopersProduct("fairlife 2%")).toBe(false);
    expect(isKingSoopersProduct("https://www.kingsoopers.com.evil.example/p/x")).toBe(false);
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
    const read = readDraft({ phrase: "milk", kind: "terms", url: "https://example.com", terms: "fairlife 2%" });
    expect("row" in read && read.row.url).toBeNull();
    expect("row" in read && read.row.terms).toBe("fairlife 2%");
  });

  it("refuses plain, from the editor and from a batch alike (TEC-39)", () => {
    const read = readDraft({ phrase: "whole milk", kind: "plain" });
    expect("error" in read && read.error).toContain("whole milk");
  });

  it("keeps a brand a batch sends, though the editor no longer asks for one", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%", brand: "Fairlife" });
    expect("row" in read && read.row.brand).toBe("Fairlife");
  });

  it("leaves note and brand out of the write when they were not sent — editing keeps the note (TEC-29)", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%" });
    expect("row" in read && "note" in read.row).toBe(false);
    expect("row" in read && "brand" in read.row).toBe(false);
  });

  it("clears a note only when a blank one is sent on purpose", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%", note: "  " });
    expect("row" in read && read.row.note).toBeNull();
  });
});
