// @vitest-environment jsdom
// TEC-256: what "Add a medication…" sends, through the real parseNewMedication and route handler, and what it
// shows when it cannot add. Nothing here ever reached the server in production: no POST to the table was logged.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseNewMedication } from "@/lib/events";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

/** An in-memory stand-in for the few PostgREST calls Lando makes. */
function fakeDb() {
  return {
    from(name: string) {
      const rows = (tables[name] ??= []);
      let pending: Row | null = null;
      const q: Record<string, unknown> = {};
      const self = () => q;
      Object.assign(q, {
        select: self,
        order: self,
        or: self,
        range: self,
        eq: self,
        is: self,
        in: self,
        update: self,
        insert: (r: Row) => ((pending = r), q),
        single: async () => {
          const row = { id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(rows.length).padStart(12, "0")}`, created_at: new Date().toISOString(), retired: false, ...pending };
          rows.push(row);
          return { data: row, error: null };
        },
        then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, fail),
      });
      return q;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  };
}

vi.mock("@/lib/supabase", () => ({ getServiceClient: () => fakeDb() }));

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.people = [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", display_name: "Tester", created_at: "2026-01-01T00:00:00Z" }];
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** fetch() wired to the real route handlers; `watch` sees every call to /api/medications first. */
async function wireFetch(watch?: (init?: RequestInit) => Response | undefined) {
  const journal = await import("@/app/api/journal/route");
  const meds = await import("@/app/api/medications/route");
  const upcoming = await import("@/app/api/upcoming/route");
  const { NextRequest } = await import("next/server");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://localhost");
    if (u.pathname === "/api/medications") {
      const early = watch?.(init);
      if (early) return early;
    }
    const req = new NextRequest(u, init as never);
    if (u.pathname === "/api/journal") return journal.GET(req);
    if (u.pathname === "/api/upcoming") return init?.method === "POST" ? upcoming.POST(req) : upcoming.GET();
    if (u.pathname === "/api/medications") return init?.method === "PATCH" ? meds.PATCH(req) : meds.POST(req);
    return new Response("{}", { status: 404 });
  });
}

/** The Medication pick (found by id: its label also names the Type radio). */
function pickList() {
  return document.getElementById("f-med") as HTMLSelectElement;
}

async function openAddForm() {
  const Journal = (await import("@/app/Journal")).default;
  render(createElement(Journal));
  fireEvent.click(await screen.findByRole("button", { name: /Tester/ }));
  await screen.findAllByRole("button", { name: /^Health/ });
  fireEvent.click(screen.getAllByRole("button", { name: /^Health/ })[0]);
  fireEvent.click(await screen.findByRole("radio", { name: "Medication" }));
  await waitFor(() => expect(pickList()).toBeTruthy());
  fireEvent.change(pickList(), { target: { value: "__add_med" } });
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
}

describe("Add a medication… sends what the server takes (TEC-256)", () => {
  it("the exact body the form sends passes the real parseNewMedication and the real route, and the row is stored", async () => {
    const sent: { method?: string; body: string }[] = [];
    await wireFetch((init) => {
      sent.push({ method: init?.method, body: String(init?.body) });
      return undefined;
    });
    await openAddForm();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe("POST");
    const body = JSON.parse(sent[0].body);
    expect(body).toEqual({ name: "Test Drops", unit: "mg", reason: "heartworm" });
    expect(parseNewMedication(body, [])).toEqual(body);
    await waitFor(() => expect(tables.medications?.map((r) => r.name)).toEqual(["Test Drops"]));
    await waitFor(() => expect(pickList().selectedOptions[0].text).toBe("Test Drops"));
  });

  it("Add without a reason sends nothing, says so in red above the Add button, and marks the Reason field", async () => {
    const sent: unknown[] = [];
    await wireFetch((init) => {
      sent.push(init);
      return undefined;
    });
    await openAddForm();
    const add = screen.getByRole("button", { name: "Add" });
    fireEvent.click(add);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/pick a reason/);
    expect(alert.className).toContain("text-danger");
    expect(sent).toEqual([]);
    expect(screen.getByLabelText("Reason").getAttribute("aria-invalid")).toBe("true");
    // Above the button, not below it where a phone's keyboard hides it.
    expect(alert.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a server answer that is not JSON still shows a reason in red", async () => {
    await wireFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await openAddForm();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const msg = await screen.findByText(/couldn't add \(the server answered 502\)/);
    expect(msg.className).toContain("text-danger");
  });

  it("pressing Add keeps the focus where it is (a phone's closing keyboard moved the form and lost the tap)", async () => {
    await wireFetch();
    await openAddForm();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "Add" }).dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});
