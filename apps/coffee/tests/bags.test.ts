import { describe, expect, it } from "vitest";
import { hostOf } from "@/lib/bags";

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
