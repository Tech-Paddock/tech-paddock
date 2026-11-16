import { afterEach, describe, expect, it, vi } from "vitest";
import { columnOf, loadPitWall, nextStep, toIssue, type GitHubIssue, type PitIssue } from "@/lib/issues";
import { byApp, byStatus, groupingFrom } from "@/lib/pitgroups";

describe("the next step on a card", () => {
  it("is the first numbered step, with its actor and star", () => {
    const body = "What and why.\n\n## Next steps\n\n1. **Owner:** ⭐ say go.\n2. **TD:** build it.\n";
    expect(nextStep(body)).toEqual({ actor: "Owner", text: "say go.", star: true });
  });

  it("skips steps marked done, struck through, or ticked", () => {
    const body = [
      "## Next steps",
      "",
      "1. **Builder:** done 2026-09-26. Built and pushed.",
      "2. **TD:** ~~draft the line~~",
      "3. **Deployment:** ✅ reconciled.",
      "4. **Deployment:** open the pull request, gate it and merge it.",
    ].join("\n");
    expect(nextStep(body)).toEqual({ actor: "Deployment", text: "open the pull request, gate it and merge it.", star: false });
  });

  it("reads the formats real issues use: ⭐ before the actor, done or skipped in the bold lead", () => {
    const body = [
      "## Next steps",
      "",
      "1. **Done, 2026-09-25, Owner:** step 1. The variable is linked.",
      "2. **TD — done 2026-09-26:** approved the two-PR shape.",
      '3. **Skipped, 2026-09-25, Owner: "skip it".** Was: a live test.',
      "4. ⭐ **Owner:** add the rule to all seven projects.",
    ].join("\n");
    expect(nextStep(body)).toEqual({ actor: "Owner", text: "add the rule to all seven projects.", star: true });
  });

  it("shortens a Linear archive link to its identifier", () => {
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

const gh = (over: Partial<GitHubIssue> = {}): GitHubIssue => ({
  number: 1,
  title: "TEC-1: A thing",
  html_url: "https://github.com/Tech-Paddock/paddock-issues/issues/1",
  updated_at: "2026-09-26T00:00:00Z",
  body: null,
  labels: [{ name: "app:home" }, { name: "owner:TD" }, { name: "status:todo" }],
  assignee: null,
  ...over,
});

describe("a GitHub issue on the board", () => {
  it("reads app and owner from their labels", () => {
    const i = toIssue(gh());
    expect(i.app).toBe("home");
    expect(i.owner).toBe("TD");
  });

  it("shows TEC-n from an imported title, otherwise #n, and links to GitHub", () => {
    expect(toIssue(gh())).toMatchObject({ id: "TEC-1", title: "A thing", url: "https://github.com/Tech-Paddock/paddock-issues/issues/1" });
    expect(toIssue(gh({ number: 21, title: "A new one" }))).toMatchObject({ id: "#21", title: "A new one" });
  });

  it("is waiting on the owner only for an Owner task with an assignee, and carries nothing of the user", () => {
    const who = { login: "someone", id: 4242 };
    const mine = toIssue(gh({ labels: [{ name: "Owner task" }], assignee: who, assignees: [who] }));
    expect(mine.waitingOnOwner).toBe(true);
    expect(JSON.stringify(mine)).not.toMatch(/someone|4242/);
    expect(toIssue(gh({ labels: [{ name: "owner task" }] })).waitingOnOwner).toBe(false);
    expect(toIssue(gh({ labels: [{ name: "Feature" }], assignee: who })).waitingOnOwner).toBe(false);
  });

  it("puts each status label in its column without regard to case, and anything parked last", () => {
    const col = (...names: string[]) => toIssue(gh({ labels: names.map((name) => ({ name })) }));
    expect(col("status:in-progress").column).toBe("progress");
    expect(col("Status:In-Review").column).toBe("review");
    expect(col("status:todo").column).toBe("todo");
    expect(col("status:backlog").column).toBe("later");
    expect(col("Feature").status).toBe("No status");
    expect(col("status:todo", "Parked")).toMatchObject({ column: "later", parked: true });
    expect(columnOf(["status:todo"], true)).toBe("later");
  });

  it("shows priority only for priority:high", () => {
    expect(toIssue(gh({ labels: [{ name: "priority:high" }] })).high).toBe(true);
    expect(toIssue(gh()).high).toBe(false);
  });

  it("takes the next step from the body", () => {
    expect(toIssue(gh({ body: "## Next steps\n\n1. **TD:** see https://github.com/Tech-Paddock/paddock-issues/issues/7 first.\n" })).next?.text).toBe("see #7 first.");
  });
});

const issue = (over: Partial<PitIssue>): PitIssue => ({
  ...toIssue(gh()),
  ...over,
});

describe("the two groupings", () => {
  const issues = [
    issue({ number: 1, column: "progress", app: "health" }),
    issue({ number: 2, column: "todo", app: "coffee", waitingOnOwner: true }),
    issue({ number: 3, column: "later", app: "coffee", parked: true, waitingOnOwner: true }),
    issue({ number: 4, column: "review", app: null, high: true }),
    issue({ number: 5, column: "review", app: "someone-new" }),
  ];

  it("by status: the owner's band, three columns, and the rest folded", () => {
    const b = byStatus(issues);
    expect(b.waiting.map((i) => i.number)).toEqual([2]);
    expect(b.columns.map((c) => c.issues.map((i) => i.number))).toEqual([[1], [4, 5], []]);
    expect(b.later.map((i) => i.number)).toEqual([3]);
  });

  it("by app: roster order, a new name kept, platform last", () => {
    expect(byApp(issues).map((g) => g.app)).toEqual(["coffee", "health", "someone-new", "Platform"]);
    expect(byApp(issues)[0].issues.map((i) => i.number)).toEqual([2, 3]);
  });

  it("defaults to status", () => {
    expect(groupingFrom(undefined)).toBe("status");
    expect(groupingFrom("app")).toBe("app");
    expect(groupingFrom("agent")).toBe("status"); // the old link falls back
    expect(groupingFrom("nonsense")).toBe("status");
  });
});

describe("asking GitHub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("makes no request without a token, and says so", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("GITHUB_TOKEN", "");
    const d = await loadPitWall();
    expect(!d.ok && d.why).toContain("GITHUB_TOKEN is not set");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403])("says the token was refused on a %i, and names Issues: read", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status })));
    const d = await loadPitWall("k");
    expect(!d.ok && d.why).toMatch(/refused the token.*Issues: read/);
  });

  it("says when the repository is not visible to the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect((await loadPitWall("k"))).toMatchObject({ ok: false, why: expect.stringMatching(/could not find .*paddock-issues/) });
  });

  it("says when GitHub is down or cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await loadPitWall("k")).toMatchObject({ ok: false, why: "GitHub answered 503" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    expect(await loadPitWall("k")).toMatchObject({ ok: false, why: expect.stringMatching(/GitHub could not be reached/) });
  });

  it("says when the reply cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await loadPitWall("k")).toMatchObject({ ok: false, why: "GitHub's reply was not JSON" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "odd" })));
    expect(await loadPitWall("k")).toMatchObject({ ok: false, why: expect.stringMatching(/not a list/) });
  });

  it("sends the token as a bearer and skips pull requests", async () => {
    const fetch = vi.fn(async () => Response.json([gh({ number: 1 }), gh({ number: 2, pull_request: {} }), gh({ number: 3 })]));
    vi.stubGlobal("fetch", fetch);
    const d = await loadPitWall("tok");
    expect(d.ok && d.issues.map((i) => i.number)).toEqual([1, 3]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/repos/Tech-Paddock/paddock-issues/issues?state=open");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("follows pages until one comes back short", async () => {
    const full = Array.from({ length: 100 }, (_, i) => gh({ number: i + 1 }));
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(full)).mockResolvedValueOnce(Response.json([gh({ number: 101 })]));
    vi.stubGlobal("fetch", fetch);
    const d = await loadPitWall("k");
    expect(d.ok && d.issues).toHaveLength(101);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
