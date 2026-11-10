import { describe, expect, it } from "vitest";
import type { LatestDeploy } from "@/lib/deploys";
import { parseVersion, versionRow, versionRows, type Latest } from "@/lib/versions";

const A = "a".repeat(40);
const B = "b".repeat(40);
const project = { slug: "coffee", name: "Coffee", url: "https://coffee.example.test", vercelProject: "tp-coffee-app" };

const deploy = (sha: string | null, state: string | null): Latest => ({
  ok: true,
  deploy: {
    project,
    deployment: sha ? { sha, createdAt: "2026-11-10T00:00:00Z" } : null,
    status: state ? { state, description: null, at: "2026-11-10T00:00:00Z" } : null,
  } satisfies LatestDeploy,
});

describe("parseVersion", () => {
  it("reads a commit, or null", () => {
    expect(parseVersion({ commit: A })).toEqual({ ok: true, commit: A });
    expect(parseVersion({ commit: null })).toEqual({ ok: true, commit: null });
  });
  it("refuses anything else", () => {
    for (const body of [null, "x", {}, { commit: 5 }, { commit: "not a hash" }, { commit: "" }]) {
      expect(parseVersion(body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("versionRow", () => {
  it("is green when the app serves the latest production deployment", () => {
    const r = versionRow("Coffee", { ok: true, commit: A }, deploy(A, "success"));
    expect(r.status).toBe("up");
  });
  it("is red when it serves something else and the latest deployment succeeded", () => {
    const r = versionRow("Coffee", { ok: true, commit: A }, deploy(B, "success"));
    expect(r.status).toBe("down");
    expect(r.detail).toContain("aaaaaaa");
    expect(r.detail).toContain("bbbbbbb");
  });
  it("is amber when the newer deployment has not gone live", () => {
    for (const state of ["failure", "pending", "in_progress", "error"]) {
      expect(versionRow("Coffee", { ok: true, commit: A }, deploy(B, state)).status, state).toBe("unknown");
    }
  });
  it("is red when the app could not be asked, and says why", () => {
    const r = versionRow("Coffee", { ok: false, detail: "nothing is served at this path", raw: "404" }, deploy(A, "success"));
    expect(r.status).toBe("down");
    expect(r.raw).toBe("404");
  });
  it("is amber, never green, when it reports no commit or GitHub has nothing to compare", () => {
    expect(versionRow("Coffee", { ok: true, commit: null }, deploy(A, "success")).status).toBe("unknown");
    expect(versionRow("Coffee", { ok: true, commit: A }, { ok: false, detail: "could not check — GitHub did not answer" }).status).toBe("unknown");
    expect(versionRow("Coffee", { ok: true, commit: A }, deploy(null, null)).status).toBe("unknown");
  });
});

describe("versionRows", () => {
  it("compares each app with its own deployment and skips a parked one", () => {
    const other = { ...project, slug: "health", name: "Health" };
    const parked = { ...project, slug: "old", name: "Old", parked: true as const };
    const rows = versionRows(
      [project, other, parked],
      new Map([
        ["coffee", { ok: true as const, commit: A }],
        ["health", { ok: true as const, commit: A }],
      ]),
      {
        kind: "checked",
        live: [project, other],
        settled: [
          { status: "fulfilled", value: { project, deployment: { sha: A, createdAt: "" }, status: { state: "success", description: null, at: "" } } },
          { status: "fulfilled", value: { project: other, deployment: { sha: B, createdAt: "" }, status: { state: "success", description: null, at: "" } } },
        ],
      }
    );
    expect(rows.map((r) => [r.target, r.status])).toEqual([["Coffee", "up"], ["Health", "down"]]);
  });
});
