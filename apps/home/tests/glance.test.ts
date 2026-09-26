import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSummary,
  isQuiet,
  mergeGlance,
  nothingAnswered,
  parseSummary,
  type SummaryItem,
  type ToolSummary,
} from "@/lib/glance";

const item = (label: string, severity: SummaryItem["severity"] = "info"): SummaryItem => ({
  label,
  detail: null,
  href: `https://example.test/${label}`,
  severity,
});

const summary = (over: Partial<ToolSummary> = {}): ToolSummary => ({
  tool: "tracker",
  generatedAt: "2026-09-25T00:00:00.000Z",
  commitments: { items: [], overflow: 0 },
  decay: { count: 0, top: null },
  looseEnds: { count: 0, top: null },
  rhythm: null,
  health: [],
  degraded: [],
  ...over,
});

function respond(body: unknown, init: ResponseInit = { status: 200 }) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(text, init)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSummary classifies every way of not getting an answer", () => {
  it("makes no request when home's secret is unset", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchSummary("https://t.test/api/summary", undefined)).toEqual({
      ok: false,
      why: "home's secret unset — no request made",
    });
    expect(await fetchSummary("https://t.test/api/summary", "")).toEqual({
      ok: false,
      why: "home's secret unset — no request made",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("names a 401 as the secrets differing", async () => {
    respond("nope", { status: 401 });
    expect(await fetchSummary("https://t.test", "s")).toEqual({ ok: false, why: "401 — secrets differ" });
  });

  it("names any other status by its code", async () => {
    respond("boom", { status: 500, statusText: "Internal Server Error" });
    expect(await fetchSummary("https://t.test", "s")).toEqual({
      ok: false,
      why: "HTTP 500 Internal Server Error",
    });
  });

  it("names a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );
    expect(await fetchSummary("https://t.test", "s")).toEqual({ ok: false, why: "timeout" });
  });

  it("unwraps a network failure to its cause", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND t.test"), { code: "ENOTFOUND" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", { cause });
      }),
    );
    expect(await fetchSummary("https://t.test", "s")).toEqual({
      ok: false,
      why: "unreachable — ENOTFOUND — getaddrinfo ENOTFOUND t.test",
    });
  });

  it("calls a body that is not JSON the wrong shape", async () => {
    respond("<html>login</html>");
    expect(await fetchSummary("https://t.test", "s")).toEqual({ ok: false, why: "wrong shape — not JSON" });
  });

  it("calls JSON missing a field the wrong shape rather than throwing later", async () => {
    const { decay: _decay, ...renamed } = summary();
    respond({ ...renamed, goneQuiet: { count: 2, top: null } });
    expect(await fetchSummary("https://t.test", "s")).toEqual({ ok: false, why: "wrong shape" });
  });

  it("returns a well-formed summary and sends the secret", async () => {
    respond(summary({ decay: { count: 2, top: item("a", "warn") } }));
    const got = await fetchSummary("https://t.test", "s3cret");
    expect(got.ok).toBe(true);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers).toEqual({ "x-internal-secret": "s3cret" });
  });
});

describe("parseSummary", () => {
  it("rejects an item with an unknown severity", () => {
    expect(parseSummary(summary({ health: [{ ...item("x"), severity: "loud" as never }] }))).toBeNull();
  });

  it("keeps a missing generatedAt as null, not a string", () => {
    const { generatedAt: _g, ...rest } = summary();
    expect(parseSummary(rest)?.generatedAt).toBeNull();
  });

  it("rejects arrays and primitives", () => {
    expect(parseSummary([])).toBeNull();
    expect(parseSummary("x")).toBeNull();
    expect(parseSummary(null)).toBeNull();
  });
});

describe("mergeGlance", () => {
  it("sums counts, keeps the most severe top, and prefixes degraded lines", () => {
    const g = mergeGlance([
      {
        tool: "A",
        fetched: {
          ok: true,
          summary: summary({
            decay: { count: 1, top: item("a-decay", "info") },
            commitments: { items: [item("a1", "info")], overflow: 1 },
            degraded: ["calendar unread"],
          }),
        },
      },
      {
        tool: "B",
        fetched: {
          ok: true,
          summary: summary({
            decay: { count: 2, top: item("b-decay", "urgent") },
            commitments: { items: [item("b1", "urgent")], overflow: 2 },
            rhythm: item("r"),
          }),
        },
      },
    ]);
    expect(g.decay).toEqual({ count: 3, top: item("b-decay", "urgent") });
    expect(g.commitments.map((c) => c.label)).toEqual(["b1", "a1"]);
    expect(g.commitmentOverflow).toBe(3);
    expect(g.degraded).toEqual(["A: calendar unread"]);
    expect(g.rhythm).toHaveLength(1);
    expect(g.sources.map((s) => s.tool)).toEqual(["A", "B"]);
    expect(g.unavailable).toEqual([]);
  });

  it("records a failed source with its reason and counts nothing for it", () => {
    const g = mergeGlance([{ tool: "Tracker", fetched: { ok: false, why: "401 — secrets differ" } }]);
    expect(g.unavailable).toEqual([{ tool: "Tracker", why: "401 — secrets differ" }]);
    expect(g.sources).toEqual([]);
    expect(nothingAnswered(g)).toBe(true);
  });
});

describe("isQuiet", () => {
  const quiet = () => mergeGlance([{ tool: "A", fetched: { ok: true, summary: summary() } }]);

  it("is quiet only when every source answered, whole, with nothing", () => {
    expect(isQuiet(quiet())).toBe(true);
  });

  it("is never quiet when a source did not answer", () => {
    expect(isQuiet(mergeGlance([{ tool: "A", fetched: { ok: false, why: "timeout" } }]))).toBe(false);
  });

  it("is never quiet when a source answered with gaps", () => {
    expect(isQuiet({ ...quiet(), degraded: ["A: calendar unread"] })).toBe(false);
  });

  it("is not quiet with anything outstanding", () => {
    expect(isQuiet({ ...quiet(), looseEnds: { count: 1, top: null } })).toBe(false);
    expect(isQuiet({ ...quiet(), health: [item("key missing")] })).toBe(false);
  });
});
