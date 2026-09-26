import { describe, expect, it } from "vitest";
import { deployError, whyGitHub, type LatestDeploy } from "@/lib/deploys";
import { envErrors, explainError, explainResponse, forParked, type Probe } from "@/lib/diagnostics";
import { budgetDistance, explainDrift } from "@/lib/drift-explain";
import { HOME, HOME_ENV, PARKED } from "@/lib/platform";
import { parseDrift } from "../scripts/drift-parse.mjs";

describe("a failure says what failed", () => {
  it("names Vercel's own error before the status code", () => {
    expect(explainResponse(503, "DEPLOYMENT_PAUSED")).toEqual({
      detail: "the Vercel project is paused",
      raw: "503 DEPLOYMENT_PAUSED",
    });
  });

  it("shows a Vercel error it does not know verbatim rather than dropping it", () => {
    expect(explainResponse(500, "SOMETHING_NEW").detail).toContain("SOMETHING_NEW");
  });

  it("falls back to what the status code means", () => {
    expect(explainResponse(404, null)).toEqual({ detail: "nothing is served at this path", raw: "404" });
    expect(explainResponse(502, null).detail).toBe("the app failed answering");
  });

  it("unwraps Node's 'fetch failed' into the cause underneath", () => {
    const failed = (code: string) =>
      new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code }) });
    expect(explainError(failed("ENOTFOUND"))).toEqual({ detail: "the address did not resolve — DNS", raw: "ENOTFOUND" });
    expect(explainError(failed("ECONNREFUSED")).detail).toBe("the connection was refused");
    expect(explainError(failed("CERT_HAS_EXPIRED")).detail).toContain("TLS");
    expect(explainError(Object.assign(new Error("t"), { name: "TimeoutError" })).detail).toMatch(/no answer within/);
  });
});

describe("a parked app is grey, not red", () => {
  const probe = (status: Probe["status"]): Probe => ({ target: "Pipeline Tracker", status, detail: "the Vercel project is paused", raw: "503", ms: 12 });

  it("turns a failed probe of a parked app into parked, keeping the reason", () => {
    const p = forParked(probe("down"), true);
    expect(p.status).toBe("parked");
    expect(p.detail).toContain("the Vercel project is paused");
  });

  it("leaves a parked app that answers, and every live app, alone", () => {
    expect(forParked(probe("up"), true).status).toBe("up");
    expect(forParked(probe("down"), false).status).toBe("down");
  });
});

describe("environment errors", () => {
  const allSet = Object.fromEntries(HOME_ENV.map((e) => [e.name, "x"]));

  it("lists nothing when everything is as it should be", () => {
    expect(envErrors(allSet)).toEqual([]);
  });

  it("tags a missing variable with what it breaks", () => {
    const errors = envErrors({ ...allSet, GITHUB_TOKEN: undefined });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ name: "GITHUB_TOKEN", affects: "The Garage" });
  });

  it("tags a missing Linear key with the Pit Wall", () => {
    expect(envErrors({ ...allSet, LINEAR_API_KEY: undefined })[0]).toMatchObject({ affects: "Pit Wall" });
  });

  it("reports a retired credential still set", () => {
    expect(envErrors({ ...allSet, VERCEL_TOKEN: "x" }).map((e) => e.name)).toEqual(["VERCEL_TOKEN"]);
    expect(envErrors({ ...allSet, INTERNAL_API_SECRET: "x" }).map((e) => e.name)).toEqual(["INTERNAL_API_SECRET"]);
  });
});

describe("drift explained", () => {
  const check = (name: string, detail = "", explain?: string) => ({ name, state: "warn" as const, detail, explain });

  it("prefers the drift check's own sentence", () => {
    expect(explainDrift(check("budget: CLAUDE.md", "440 / 450", "Its own words."))).toBe("Its own words.");
  });

  it("falls back to the check's family, and says nothing for a family it does not know", () => {
    expect(explainDrift(check("budget: CLAUDE.md"))).toMatch(/line limit/);
    expect(explainDrift(check("fresh: coffee"))).toMatch(/handoff/);
    expect(explainDrift(check("a check nobody has seen"))).toBeNull();
  });

  it("says how far a budget is from its cap", () => {
    expect(budgetDistance(check("budget: CLAUDE.md", "79 / 80"))).toBe("79 of 80 lines — 1 to spare");
    expect(budgetDistance(check("budget: CLAUDE.md", "82 / 80"))).toBe("82 of 80 lines — 2 over");
    expect(budgetDistance(check("budget: CLAUDE.md", "unreadable"))).toBeNull();
    expect(budgetDistance(check("fresh: coffee", "79 / 80"))).toBeNull();
  });
});

describe("deploy errors", () => {
  const deploy = (state: string | null, project: LatestDeploy["project"] = HOME, description: string | null = null): LatestDeploy => ({
    project,
    deployment: { sha: "abcdef1234567", createdAt: "2026-09-26T00:00:00Z" },
    status: state === null ? null : { state, description, at: "2026-09-26T00:01:00Z" },
  });

  it("says nothing about a deploy that is live or on its way", () => {
    for (const state of ["success", "pending", "queued", "in_progress"]) expect(deployError(deploy(state))).toBeNull();
  });

  it("reports a failed deploy as broken, with the commit and what Vercel said", () => {
    const row = deployError(deploy("failure", HOME, "Deployment has failed"));
    expect(row?.status).toBe("down");
    expect(row?.raw).toContain("abcdef1");
    expect(row?.raw).toContain("Deployment has failed");
  });

  it("leaves a parked project out, whose red deploy is expected", () => {
    expect(deployError(deploy("failure", PARKED[0]))).toBeNull();
  });

  it("tells a refused token from a GitHub that did not answer", () => {
    expect(whyGitHub("HTTP 401")).toMatch(/refused GITHUB_TOKEN; it may be expired/);
    expect(whyGitHub("HTTP 403")).toMatch(/Deployments: read/);
    expect(whyGitHub("HTTP 502")).toMatch(/did not answer$/);
  });

  it("says it could not tell, rather than nothing, when there is no deploy or no status", () => {
    expect(deployError({ project: HOME, deployment: null, status: null })?.status).toBe("unknown");
    expect(deployError(deploy(null))?.status).toBe("unknown");
    expect(deployError(deploy("something-new"))?.status).toBe("unknown");
  });
});

describe("collect-drift's parser", () => {
  const out = (checks: unknown) => JSON.stringify({ checks, counts: { ok: 99, warn: 0, fail: 0 } });

  it("carries a check's own explanation through", () => {
    const d = parseDrift(out([{ name: "a", state: "warn", detail: "", explain: " Why it matters. " }]));
    expect((d.checks[0] as { explain?: string }).explain).toBe("Why it matters.");
  });

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
