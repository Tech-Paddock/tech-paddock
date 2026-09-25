import { describe, expect, it } from "vitest";
import { classifySecretStatus, secretSubjects } from "@/lib/diagnostics";
import { PROBED, TOOLS, type DeclaredApp } from "@/lib/platform";
import { parseDrift } from "../scripts/drift-parse.mjs";

describe("the shared-secret probe maps status codes", () => {
  it("2xx is a match", () => {
    expect(classifySecretStatus(200, "/api/summary").status).toBe("up");
  });

  it("401 and 403 are a mismatch", () => {
    expect(classifySecretStatus(401, "/api/summary").status).toBe("down");
    expect(classifySecretStatus(403, "/api/summary").status).toBe("down");
  });

  it("anything else says nothing about the secret", () => {
    for (const code of [302, 404, 500, 503]) {
      const r = classifySecretStatus(code, "/api/summary");
      expect(r.status).toBe("unknown");
      expect(r.detail).toContain(String(code));
    }
  });
});

describe("which projects get the secret probe", () => {
  const declared = (slug: string, hasSummaryRoute: boolean): DeclaredApp => ({
    slug,
    envNames: [],
    hasHealthRoute: false,
    hasSummaryRoute,
    hasTestScript: false,
  });

  it("includes the parked tracker, which TOOLS alone never did", () => {
    const apps = [declared("tracker", true), declared("coffee", false)];
    expect(secretSubjects(PROBED, apps).map((p) => p.slug)).toEqual(["tracker"]);
    expect(secretSubjects(TOOLS, apps)).toEqual([]);
  });
});

describe("collect-drift's parser", () => {
  const out = (checks: unknown) => JSON.stringify({ checks, counts: { ok: 99, warn: 0, fail: 0 } });

  it("reads checks and recounts them from the rows", () => {
    const d = parseDrift(
      out([
        { name: "a", state: "ok", detail: "fine" },
        { name: "b", state: "warn" },
        { name: "c", state: "fail", detail: "false" },
      ]),
    );
    expect(d.complete).toBe(true);
    expect(d.counts).toEqual({ ok: 1, warn: 1, fail: 1 });
    expect(d.checks[1]).toEqual({ name: "b", state: "warn", detail: "" });
  });

  it("refuses output that is not JSON", () => {
    expect(parseDrift("drift: 3 fail")).toMatchObject({ complete: false, checks: [] });
  });

  it("refuses output with no checks array", () => {
    expect(parseDrift(JSON.stringify({ results: [] }))).toMatchObject({ complete: false });
  });

  it("refuses the whole panel over one unreadable row rather than dropping it", () => {
    const d = parseDrift(out([{ name: "a", state: "ok" }, { name: "b", state: "maybe" }]));
    expect(d.complete).toBe(false);
    expect(d.checks).toEqual([]);
  });
});
