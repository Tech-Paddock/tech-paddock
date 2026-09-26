import { describe, expect, it } from "vitest";
import { branchArea, classifyBranches, deployRow, ownerOf, type LatestDeploy, type PitItem } from "@/lib/pitwall";
import { filterItems } from "@/lib/pitfilter";
import { HOME, PARKED } from "@/lib/platform";

const AGENTS = new Set(["td", "deployment", "techpad-gen", "resume", "coffee", "health", "cookbook"]);

describe("which agent a branch belongs to", () => {
  it("reads the area from claude/<area>-<change>", () => {
    expect(branchArea("claude/home-review-fixes")).toBe("home");
    expect(branchArea("claude/td-onboarding-0lrnq9")).toBe("td");
    expect(branchArea("feature")).toBe("feature");
  });

  it("maps app folders and layers to their owners, and leaves the rest unattributed", () => {
    expect(ownerOf("home", AGENTS)).toBe("techpad-gen");
    expect(ownerOf("cookbook", AGENTS)).toBe("cookbook");
    expect(ownerOf("ci", AGENTS)).toBe("deployment");
    expect(ownerOf("td", AGENTS)).toBe("td");
    expect(ownerOf("docs", AGENTS)).toBeNull();
    expect(ownerOf("whatever", AGENTS)).toBeNull();
  });

  it("attributes nobody who is not on the roster", () => {
    expect(ownerOf("home", new Set(["td"]))).toBeNull();
  });
});

const pr = (n: number, ref: string, sha: string, merged: string | null = null) => ({
  number: n,
  title: `PR ${n}`,
  head: { ref, sha },
  merged_at: merged,
});
const branch = (name: string, sha: string) => ({ name, commit: { sha } });

describe("classifyBranches", () => {
  it("does not call a squash-merged branch unpushed, even though it is ahead of main", () => {
    const items = classifyBranches(
      [],
      [branch("main", "m"), branch("claude/home-old", "tip")],
      [pr(1, "claude/home-old", "tip", "2026-09-24T00:00:00Z")],
      new Map(),
      AGENTS,
    );
    expect(items).toHaveLength(1);
    expect(items[0].state).toBe("clear");
    expect(items[0].title).toMatch(/1 merged branch is not yet deleted/);
  });

  it("drops a branch with nothing ahead of main, and lists one that is", () => {
    const items = classifyBranches(
      [],
      [branch("claude/coffee-empty", "a"), branch("claude/coffee-work", "b")],
      [],
      new Map([
        ["claude/coffee-empty", 0],
        ["claude/coffee-work", 3],
      ]),
      AGENTS,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ state: "agent", agent: "coffee", ref: "claude/coffee-work" });
    expect(items[0].detail).toMatch(/^3 commits ahead/);
  });

  it("lists a branch it could not compare rather than dropping it", () => {
    const items = classifyBranches([], [branch("claude/x-y", "a")], [], new Map([["claude/x-y", null]]), AGENTS);
    expect(items[0].detail).toMatch(/Could not compare/);
  });

  it("puts open pull requests in the box, attributed, and skips their branches", () => {
    const items = classifyBranches(
      [pr(7, "claude/health-thing", "h")],
      [branch("claude/health-thing", "h")],
      [],
      new Map(),
      AGENTS,
    );
    expect(items).toEqual([
      expect.objectContaining({ state: "box", agent: "health", title: "#7 is open and waiting on you" }),
    ]);
  });

  it("says clear when there is nothing at all", () => {
    expect(classifyBranches([], [branch("main", "m")], [], new Map(), AGENTS)[0].state).toBe("clear");
  });
});

const deploy = (state: string, project: LatestDeploy["project"] = HOME, description: string | null = "Deployment has completed"): LatestDeploy => ({
  project,
  deployment: { sha: "861d85491439e0314354e594d5b664f6f9153dfe", createdAt: "2026-09-25T00:51:32Z" },
  status: { state, description, at: "2026-09-25T00:52:10Z" },
});

describe("deployRow reads only the latest production deployment", () => {
  it("is live on success", () => {
    const row = deployRow(deploy("success"), AGENTS);
    expect(row).toMatchObject({ live: true, item: { state: "clear", agent: "techpad-gen", ref: "tp-home" } });
  });

  it("boxes a failure and quotes Vercel", () => {
    const row = deployRow(deploy("failure", HOME, "Deployment has failed"), AGENTS);
    expect(row).toMatchObject({ live: false, item: { state: "box" } });
    if ("item" in row) expect(row.item.detail).toContain('"Deployment has failed"');
  });

  it("does not box a parked project's failure", () => {
    const row = deployRow(deploy("error", PARKED[0]), AGENTS);
    expect(row).toMatchObject({ item: { state: "clear" } });
    if ("item" in row) expect(row.item.title).toMatch(/parked/);
  });

  it("shows a build in progress without alarm", () => {
    expect(deployRow(deploy("in_progress"), AGENTS)).toMatchObject({ live: false, item: { state: "clear" } });
  });

  it("reports what it cannot read rather than guessing", () => {
    expect(deployRow(deploy("mystery"), AGENTS)).toEqual({
      why: 'tp-home: its latest production deployment reads "mystery", which this page does not interpret',
    });
    expect(deployRow({ project: HOME, deployment: null, status: null }, AGENTS)).toHaveProperty("why");
    expect(deployRow({ ...deploy("success"), status: null }, AGENTS)).toHaveProperty("why");
  });
});

describe("the Pit Wall filter", () => {
  const items: PitItem[] = [
    { state: "box", source: "github", agent: "coffee", title: "a", detail: "", ref: "a" },
    { state: "agent", source: "github", agent: "health", title: "b", detail: "", ref: "b" },
    { state: "clear", source: "deployments", agent: null, title: "c", detail: "", ref: "c" },
  ];

  it("passes everything with no filter", () => {
    expect(filterItems(items, { state: "", source: "", agent: "" })).toHaveLength(3);
  });

  it("narrows by state, source and agent together", () => {
    expect(filterItems(items, { state: "box", source: "", agent: "" }).map((i) => i.ref)).toEqual(["a"]);
    expect(filterItems(items, { state: "", source: "deployments", agent: "" }).map((i) => i.ref)).toEqual(["c"]);
    expect(filterItems(items, { state: "", source: "", agent: "health" }).map((i) => i.ref)).toEqual(["b"]);
    expect(filterItems(items, { state: "box", source: "", agent: "health" })).toEqual([]);
  });
});
