import { afterEach, describe, expect, it, vi } from "vitest";
import { columnOf, loadPitWall, nextStep, toIssue, type LinearNode, type PitIssue } from "@/lib/linear";
import { byAgent, byStatus, groupingFrom } from "@/lib/pitgroups";

describe("the next step on a card", () => {
  it("is the first numbered step, with its actor and star", () => {
    const body = "What and why.\n\n## Next steps\n\n1. **Joel:** ⭐ say go.\n2. **TD:** build it.\n";
    expect(nextStep(body)).toEqual({ actor: "Joel", text: "say go.", star: true });
  });

  it("skips steps marked done, struck through, or ticked", () => {
    const body = [
      "## Next steps",
      "",
      "1. **TechPad Gen:** done 2026-09-26. Built and pushed.",
      "2. **TD:** ~~draft the line~~",
      "3. **Health:** ✅ reconciled.",
      "4. **Deployment:** open the pull request, gate it and merge it.",
    ].join("\n");
    expect(nextStep(body)).toEqual({ actor: "Deployment", text: "open the pull request, gate it and merge it.", star: false });
  });

  it("reads the formats real issues use: ⭐ before the actor, done or skipped in the bold lead", () => {
    const body = [
      "## Next steps",
      "",
      "1. **Done, 2026-09-25, Joel:** step 1. The variable is linked.",
      "2. **TD — done 2026-09-26:** approved the two-PR shape.",
      '3. **Skipped, 2026-09-25, Joel: "skip it".** Was: a live test.',
      "4. ⭐ **Joel:** add the rule to all seven projects.",
    ].join("\n");
    expect(nextStep(body)).toEqual({ actor: "Joel", text: "add the rule to all seven projects.", star: true });
  });

  it("shortens a Linear issue link to its identifier", () => {
    const body = "## Next steps\n\n1. **TD:** see https://linear.app/tech-paddock/issue/TEC-7/login-rate-limit first.\n";
    expect(nextStep(body)?.text).toBe("see TEC-7 first.");
  });

  it("strips markdown down to the words", () => {
    const body = "## Next steps\n\n1. **TD:** read `supabase/README.md` and [the plan](https://example.com).\n";
    expect(nextStep(body)?.text).toBe("read supabase/README.md and the plan.");
  });

  it("stops at the next heading and ignores sub-bullets", () => {
    const body = "## Next steps\n\n1. **TD:** one.\n   * a detail\n\n## Notes\n\n1. not a step\n";
    expect(nextStep(body)?.text).toBe("one.");
  });

  it("is null with no Next steps, or when every step is done", () => {
    expect(nextStep(null)).toBeNull();
    expect(nextStep("Just a note.")).toBeNull();
    expect(nextStep("## Next steps\n\n1. **TD:** done.\n")).toBeNull();
  });
});

const node = (over: Partial<LinearNode> = {}): LinearNode => ({
  identifier: "TEC-1",
  title: "A thing",
  url: "https://linear.app/x/issue/TEC-1",
  priority: 3,
  priorityLabel: "Medium",
  updatedAt: "2026-09-26T00:00:00Z",
  description: null,
  state: { name: "Todo", type: "unstarted" },
  labels: { nodes: [{ name: "agent:TechPad Gen" }, { name: "owner:TD" }] },
  assignee: null,
  ...over,
});

describe("a Linear issue on the board", () => {
  it("reads agent and owner from their labels", () => {
    const i = toIssue(node());
    expect(i.agent).toBe("TechPad Gen");
    expect(i.owner).toBe("TD");
  });

  it("is waiting on Joel when it has an assignee, and carries nothing of the user", () => {
    const i = toIssue(node({ assignee: { id: "u1" } }));
    expect(i.waitingOnJoel).toBe(true);
    expect(JSON.stringify(i)).not.toContain("u1");
  });

  it("puts each state in its column, and anything parked last", () => {
    expect(columnOf({ name: "In Progress", type: "started" }, false)).toBe("progress");
    expect(columnOf({ name: "In Review", type: "started" }, false)).toBe("review");
    expect(columnOf({ name: "Todo", type: "unstarted" }, false)).toBe("todo");
    expect(columnOf({ name: "Backlog", type: "backlog" }, false)).toBe("later");
    expect(columnOf({ name: "Todo", type: "unstarted" }, true)).toBe("later");
    expect(toIssue(node({ labels: { nodes: [{ name: "Parked" }] } })).parked).toBe(true);
  });
});

const issue = (over: Partial<PitIssue>): PitIssue => ({
  ...toIssue(node()),
  ...over,
});

describe("the two groupings", () => {
  const issues = [
    issue({ id: "TEC-1", column: "progress", agent: "Health" }),
    issue({ id: "TEC-2", column: "todo", agent: "TD", waitingOnJoel: true }),
    issue({ id: "TEC-3", column: "later", agent: "TD", parked: true, waitingOnJoel: true }),
    issue({ id: "TEC-4", column: "review", agent: null, priority: 1 }),
    issue({ id: "TEC-5", column: "review", agent: "Someone New", priority: 4 }),
  ];

  it("by status: Joel's band, three columns, and the rest folded", () => {
    const b = byStatus(issues);
    expect(b.joel.map((i) => i.id)).toEqual(["TEC-2"]);
    expect(b.columns.map((c) => c.issues.map((i) => i.id))).toEqual([["TEC-1"], ["TEC-4", "TEC-5"], []]);
    expect(b.later.map((i) => i.id)).toEqual(["TEC-3"]);
  });

  it("by agent: roster order, a new name kept, no agent last", () => {
    expect(byAgent(issues).map((g) => g.agent)).toEqual(["TD", "Health", "Someone New", "No agent"]);
    expect(byAgent(issues)[0].issues.map((i) => i.id)).toEqual(["TEC-2", "TEC-3"]);
  });

  it("defaults to status", () => {
    expect(groupingFrom(undefined)).toBe("status");
    expect(groupingFrom("agent")).toBe("agent");
    expect(groupingFrom("nonsense")).toBe("status");
  });
});

describe("asking Linear", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes no request without a key, and says so", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const d = await loadPitWall(undefined);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.why).toContain("LINEAR_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says the key was refused on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const d = await loadPitWall("k");
    expect(!d.ok && d.why).toMatch(/refused the key/);
  });

  it("says why when the query itself is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ message: "Cannot query field" }] })));
    const d = await loadPitWall("k");
    expect(!d.ok && d.why).toMatch(/Cannot query field/);
  });

  it("follows pages until there are none left", async () => {
    const page = (id: string, hasNextPage: boolean) =>
      Response.json({ data: { issues: { nodes: [node({ identifier: id })], pageInfo: { hasNextPage, endCursor: hasNextPage ? "c" : null } } } });
    const fetch = vi.fn().mockResolvedValueOnce(page("TEC-1", true)).mockResolvedValueOnce(page("TEC-2", false));
    vi.stubGlobal("fetch", fetch);
    const d = await loadPitWall("k");
    expect(d.ok && d.issues.map((i) => i.id)).toEqual(["TEC-1", "TEC-2"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
