import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryingFetch } from "@/lib/supabase";

// TEC-175. Supabase intermittently answers one request with 401
// "JWT issued at future" (clock drift between its gateway and backend). The
// next request succeeds, so the fetch sends it once more.

const FUTURE = JSON.stringify({ message: "JWT issued at future", code: "PGRST303" });
const real = globalThis.fetch;
let calls: { input: unknown; init?: RequestInit }[];

function stub(...answers: Response[]) {
  calls = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return answers[calls.length - 1] ?? new Response("extra call", { status: 500 });
  }) as typeof fetch;
}

// Lets the pause before a retry elapse, then returns the answer.
async function run(p: Promise<Response>) {
  await vi.advanceTimersByTimeAsync(1000);
  return p;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = real;
});

describe("retryingFetch", () => {
  it("retries a 401 naming the message once and returns the second response", async () => {
    stub(new Response(FUTURE, { status: 401 }), new Response("[1]", { status: 200 }));
    const res = await run(retryingFetch("https://x.test/rest/v1/events", { method: "GET" }));
    expect(calls).toHaveLength(2);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("[1]");
    for (const c of calls) expect(c.init?.cache).toBe("no-store");
  });

  it("resends a request body on the retry", async () => {
    stub(new Response(FUTURE, { status: 401 }), new Response("{}", { status: 201 }));
    const body = JSON.stringify({ id: "a" });
    const res = await run(retryingFetch("https://x.test/rest/v1/events", { method: "POST", body }));
    expect(res.status).toBe(201);
    expect(calls.map((c) => c.init?.body)).toEqual([body, body]);
  });

  it("can send a Request's body again", async () => {
    stub(new Response(FUTURE, { status: 401 }), new Response("{}", { status: 201 }));
    const req = new Request("https://x.test/rest/v1/events", { method: "POST", body: "payload" });
    await run(retryingFetch(req));
    const sent = await Promise.all(calls.map((c) => (c.input as Request).text()));
    expect(sent).toEqual(["payload", "payload"]);
  });

  it("does not retry any other 401", async () => {
    stub(new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 }));
    const res = await run(retryingFetch("https://x.test/rest/v1/events"));
    expect(calls).toHaveLength(1);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid API key");
  });

  it("does not retry a non-401, even one that mentions the message", async () => {
    stub(new Response(FUTURE, { status: 500 }));
    const res = await run(retryingFetch("https://x.test/rest/v1/events"));
    expect(calls).toHaveLength(1);
    expect(res.status).toBe(500);
  });

  it("does not retry a success", async () => {
    stub(new Response("[]", { status: 200 }));
    await run(retryingFetch("https://x.test/rest/v1/events"));
    expect(calls).toHaveLength(1);
  });

  it("returns a second failure as it is, without a third try", async () => {
    stub(new Response(FUTURE, { status: 401 }), new Response(FUTURE, { status: 401 }), new Response("[]"));
    const res = await run(retryingFetch("https://x.test/rest/v1/events"));
    expect(calls).toHaveLength(2);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(FUTURE);
  });

  it("leaves the body readable for the caller when it is not retried", async () => {
    stub(new Response(JSON.stringify({ message: "nope" }), { status: 401 }));
    const res = await run(retryingFetch("https://x.test/rest/v1/events"));
    expect(await res.json()).toEqual({ message: "nope" });
  });
});
