import { describe, expect, it, vi } from "vitest";
import { findPreviousBag, findRoasterDomain, hostOf, LookupError } from "@/lib/bags";

// The Supabase query builder is chainable and only resolves at the end, so the
// stub returns itself from every link and hands back a fixed result at the tip.
const stub = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const link of ["from", "select", "ilike", "order", "limit", "not"]) chain[link] = () => chain;
  chain.maybeSingle = async () => stub.result;
  return { getServiceClient: () => chain };
});

function answers(data: unknown) {
  stub.result = { data, error: null };
}
function fails(message: string) {
  stub.result = { data: null, error: { message } };
}

describe("hostOf", () => {
  it("reduces a product URL to the host we can pin a search to", () => {
    expect(hostOf("https://sweetbloomcoffee.com/products/maria-gutierrez")).toBe("sweetbloomcoffee.com");
    expect(hostOf("https://www.sweetbloomcoffee.com/pages/brew-guides")).toBe("sweetbloomcoffee.com");
    expect(hostOf("https://SHOP.SweetBloomCoffee.com/x")).toBe("shop.sweetbloomcoffee.com");
  });

  it("returns null rather than a guess for anything unparseable", () => {
    // A domain we cannot derive is left unpinned. Inventing one from the
    // roaster's name is the same failure mode as inventing a recipe.
    for (const bad of [null, undefined, "", "sweetbloomcoffee.com", "not a url"]) {
      expect(hostOf(bad)).toBeNull();
    }
  });
});

// Both lookups answer null for a legitimate "no", which is exactly why a
// swallowed error hid an unreachable database behind a plausible answer.
describe("findPreviousBag", () => {
  it("answers null when this coffee is genuinely new", async () => {
    answers(null);
    await expect(findPreviousBag("Sweet Bloom", "Maria Gutierrez")).resolves.toBeNull();
  });

  it("answers null when the previous bag was never dialled in", async () => {
    answers({ id: "1", my_method: null, my_grinder: null, my_grind_setting: null });
    await expect(findPreviousBag("Sweet Bloom", "Maria Gutierrez")).resolves.toBeNull();
  });

  it("carries the dial-in forward when there is one", async () => {
    answers({ id: "1", my_method: "v60", my_grinder: "Ode", my_grind_setting: "7" });
    await expect(findPreviousBag("Sweet Bloom", "Maria Gutierrez")).resolves.toMatchObject({ my_method: "v60" });
  });

  it("throws rather than pass a failed lookup off as a first purchase", async () => {
    fails("permission denied for schema coffee");
    await expect(findPreviousBag("Sweet Bloom", "Maria Gutierrez")).rejects.toBeInstanceOf(LookupError);
    await expect(findPreviousBag("Sweet Bloom", "Maria Gutierrez")).rejects.toThrow(
      /permission denied for schema coffee/
    );
  });
});

describe("findRoasterDomain", () => {
  it("pins the search to a host a previous product URL verified", async () => {
    answers({ product_url: "https://sweetbloomcoffee.com/products/x", guide_url: null });
    await expect(findRoasterDomain("Sweet Bloom")).resolves.toBe("sweetbloomcoffee.com");
  });

  it("leaves the first search for an unknown roaster unpinned", async () => {
    answers(null);
    await expect(findRoasterDomain("Sweet Bloom")).resolves.toBeNull();
  });

  it("throws rather than leave a search unpinned because the database was down", async () => {
    // Unpinned is the documented behaviour for a roaster we have never seen.
    // Reaching it via a broken database is a different thing wearing its face.
    fails("permission denied for schema coffee");
    await expect(findRoasterDomain("Sweet Bloom")).rejects.toBeInstanceOf(LookupError);
  });
});
